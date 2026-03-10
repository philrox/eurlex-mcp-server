# eurlex-mcp-server — Bauplan

> Standalone MCP-Server für EU-Recht via EUR-Lex Cellar API.
> Stack: TypeScript · Streamable HTTP · Vitest · Cloudflare Workers (optional)

---

## 1. Kontext & Ziel

**Problem:** EU-Recht (AI Act, DSGVO, NIS2, etc.) ist nicht im österreichischen RIS. Der ris-mcp-Server kann es nicht liefern.

**Lösung:** Eigenständiger MCP-Server mit 2 Tools:
- `eurlex_search` → SPARQL-Suche → liefert CELEX-IDs
- `eurlex_fetch` → Cellar REST → liefert Volltext per CELEX-ID

**Analogie zum ris-mcp:**
| ris-mcp | eurlex-mcp |
|---|---|
| `ris_bundesrecht` (Suche) | `eurlex_search` |
| `ris_dokument` (Abruf) | `eurlex_fetch` |

---

## 2. Architektur

```
┌─────────────────────────────────────────┐
│           eurlex-mcp-server             │
│                                         │
│  ┌──────────────┐  ┌──────────────────┐ │
│  │ eurlex_search │  │  eurlex_fetch    │ │
│  │              │  │                  │ │
│  │ SPARQL POST  │  │ REST GET /celex/ │ │
│  └──────┬───────┘  └────────┬─────────┘ │
│         │                   │           │
│  ┌──────▼───────────────────▼─────────┐ │
│  │         CellarClient               │ │
│  │   - sparqlQuery()                  │ │
│  │   - fetchDocument()                │ │
│  │   - buildSparqlQuery()             │ │
│  └────────────────────────────────────┘ │
│                                         │
│  ┌────────────────────────────────────┐ │
│  │    createServer() [Factory]        │ │
│  │    → neuer McpServer pro Session   │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
          │                    │
          ▼                    ▼
  publications.europa.eu/   publications.europa.eu/
  webapi/rdf/sparql          resource/celex/{id}
```

**Transport:** Streamable HTTP (für Remote-Deployment auf Hetzner/Cloudflare)
**Auth:** Keine — beide Endpoints sind vollständig öffentlich
**Server-Pattern:** Factory-Funktion `createServer()` erstellt pro Session einen neuen `McpServer` (gemäß offiziellem SDK-Beispiel)

### Agent-DX: MCP Prompt als Skill-File

Inspiriert durch das "Skill Files as Agent Documentation"-Pattern (vgl. CLI-for-AI-Agents):
Domänenwissen, das nicht in Tool-Descriptions passt, wird als **MCP Prompt** exponiert.

Der Server registriert einen Prompt `eurlex_guide`, den der Agent bei Bedarf abruft:

```typescript
server.prompt('eurlex_guide', {}, () => ({
  messages: [{
    role: 'user',
    content: {
      type: 'text',
      text: `# EUR-Lex Recherche-Guide

## CELEX-Nummern-Schema
- 3 = Sekundärrecht EU (Verordnungen, Richtlinien, Entscheidungen)
- Danach: Jahr (4-stellig) + Typ-Buchstabe + Dokumentnummer
- Beispiele: 32024R1689 (AI Act), 32016R0679 (DSGVO), 32022L2555 (NIS2)
- R = Regulation (Verordnung), L = Richtlinie, D = Entscheidung

## Typ-Buchstaben → resource_type Mapping
| CELEX-Buchstabe | resource_type | Bedeutung |
|---|---|---|
| R | REG | Verordnung (direkt anwendbar) |
| L | DIR | Richtlinie (muss umgesetzt werden) |
| D | DEC | Entscheidung/Beschluss |

## Suchstrategie
1. eurlex_search sucht NUR in Titeln, nicht im Volltext
2. Suchbegriffe in der Sprache des Titels verwenden (DE Titel → DE Suchbegriff)
3. Bei Nicht-Treffern: Synonyme probieren ("KI" vs "künstliche Intelligenz")
4. Bekannte CELEX-ID? → Direkt eurlex_fetch nutzen, Search überspringen

## Bekannte CELEX-IDs wichtiger Rechtsakte
- AI Act: 32024R1689
- DSGVO: 32016R0679
- NIS2-Richtlinie: 32022L2555
- Digital Services Act: 32022R2065
- Digital Markets Act: 32022R1925
- Data Act: 32023R2854
- Data Governance Act: 32022R0868

## Limitations
- Sehr lange Dokumente (AI Act: ~1.3 MB) werden bei max_chars abgeschnitten
- SPARQL-Antwortzeit: 2-10 Sekunden
- Nicht alle Dokumente haben eine XHTML-Version`
    }
  }]
}))
```

**Warum Prompt statt Tool-Description:**
- Tool-Descriptions werden bei JEDEM Tool-Call geladen → Context Window Tax
- MCP Prompt wird nur on-demand abgerufen wenn der Agent Domänenwissen braucht
- Entspricht dem "Context Window Discipline"-Prinzip aus dem CLI-for-AI-Agents Artikel

---

## 3. Endpoints — Technische Details

### 3.1 SPARQL Endpoint (Search)

```
URL:    https://publications.europa.eu/webapi/rdf/sparql
Method: POST (nicht GET — vermeidet URL-Längenlimits)
Auth:   keine
Content-Type: application/sparql-query
Accept: application/sparql-results+json
```

**Query-Beispiel** (AI Act nach Titel):
```sparql
PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT DISTINCT ?work ?celex ?title ?date ?resType WHERE {
  ?work cdm:work_has_resource-type
        <http://publications.europa.eu/resource/authority/resource-type/REG> .
  ?work cdm:work_has_resource-type ?resTypeUri .
  BIND(REPLACE(STR(?resTypeUri), "^.*/", "") AS ?resType)
  ?work cdm:resource_legal_id_celex ?celex .
  OPTIONAL { ?work cdm:work_date_document ?date . }
  ?expr cdm:expression_belongs_to_work ?work .
  ?expr cdm:expression_uses_language
        <http://publications.europa.eu/resource/authority/language/DEU> .
  ?expr cdm:expression_title ?title .
  FILTER(CONTAINS(LCASE(STR(?title)), "künstliche intelligenz"))
}
ORDER BY DESC(?date)
LIMIT 10
```

**Wichtige Design-Entscheidungen (verifiziert via Live-Tests):**
- **POST statt GET:** SPARQL-Query wird als Body gesendet (`Content-Type: application/sparql-query`), nicht als URL-Parameter. Vermeidet URL-Längenlimits.
- **Titel-Triple ist REQUIRED, nicht OPTIONAL:** Wenn nach Titel gesucht wird, macht `OPTIONAL` + `FILTER` keinen Sinn. Die Expression/Titel-Triples werden als required eingebunden.
- **Resource-Type aus Query, nicht aus Input:** `BIND(REPLACE(STR(?resTypeUri), "^.*/", "") AS ?resType)` extrahiert den Typ (REG, DIR, etc.) direkt aus dem SPARQL-Result statt ihn aus dem Input-Parameter zu übernehmen.
- **`FILTER(CONTAINS(...))` statt `bif:contains`:** Virtuosos `bif:contains` ist schneller, aber unzuverlässig bei Sprachmix (dt. Titel + engl. Suchwort). `FILTER(CONTAINS(...))` ist robuster (live verifiziert).

**Ressource-Types für Filter:**
| Typ | URI-Suffix |
|---|---|
| Verordnung (REG) | `REG` |
| Richtlinie (DIR) | `DIR` |
| Entscheidung | `DEC` |
| EuGH-Urteil | `JUDG` |
| Alle | kein Typ-Filter |

---

### 3.2 Cellar REST API (Fetch)

```
URL:    https://publications.europa.eu/resource/celex/{CELEX_ID}
Method: GET
Auth:   keine
Redirect: 303 See Other → folgen (redirect: 'follow')
```

**Headers für XHTML-Volltext auf Deutsch:**
```
Accept:          application/xhtml+xml
Accept-Language: de   (ISO 639-1: de=Deutsch, en=Englisch, fr=Französisch)
```

> **Achtung:** `Accept: text/html` liefert HTTP 400/404! Nur `application/xhtml+xml` funktioniert.
> Verifiziert am 2026-03-05 mit AI Act und DSGVO.

**Beispiel AI Act:**
```
GET https://publications.europa.eu/resource/celex/32024R1689
Accept: application/xhtml+xml
Accept-Language: de
→ 303 Redirect → http://publications.europa.eu/resource/cellar/{UUID}.0004.03/DOC_1
→ 200 OK, Content-Type: application/xhtml+xml;charset=UTF-8
```

**Warum nicht eur-lex.europa.eu?**
Die EUR-Lex-Frontend-URLs (`eur-lex.europa.eu/legal-content/...`) sind durch AWS WAF geschützt und liefern bei programmatischem Zugriff HTTP 202 mit leerem Body (`x-amzn-waf-action: challenge`). Nur die Cellar REST API funktioniert ohne Browser.

**CELEX-Nummern-Schema:**
```
3 = Sekundärrecht EU
2024 = Jahr
R = Regulation (Verordnung)
1689 = Dokumentnummer

Weitere Präfixe:
L = Richtlinie (DIR)
D = Entscheidung
```

**Accept-Language Mapping:**
| Tool-Parameter | Accept-Language Header |
|---|---|
| `DEU` | `de` |
| `ENG` | `en` |
| `FRA` | `fr` |

**Verfügbare Formate:**
| Accept-Header | Format | Status |
|---|---|---|
| `application/xhtml+xml` | XHTML (empfohlen für Volltext) | Funktioniert |
| `application/xml;notice=object` | Formex XML (Metadaten) | Funktioniert |
| `application/pdf` | PDF | Funktioniert (Fallback) |
| `text/html` | HTML | FUNKTIONIERT NICHT (400/404) |
| `text/plain` | Plaintext | FUNKTIONIERT NICHT |

---

## 4. Projektstruktur

```
eurlex-mcp-server/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── src/
│   ├── index.ts              # Server-Einstiegspunkt
│   ├── constants.ts          # URLs, Limits, Defaults
│   ├── types.ts              # TypeScript Interfaces
│   ├── services/
│   │   └── cellarClient.ts   # API-Client (SPARQL + REST)
│   ├── schemas/
│   │   ├── searchSchema.ts   # Zod: eurlex_search Input
│   │   └── fetchSchema.ts    # Zod: eurlex_fetch Input
│   ├── prompts/
│   │   └── guide.ts          # eurlex_guide Prompt (Agent-Kontext on-demand)
│   └── tools/
│       ├── search.ts         # eurlex_search Tool-Impl.
│       └── fetch.ts          # eurlex_fetch Tool-Impl.
└── tests/
    ├── cellarClient.test.ts
    ├── search.tool.test.ts
    └── fetch.tool.test.ts
```

---

## 5. Tool-Definitionen

### Design-Prinzip: Schlanke Descriptions, Kontext on-demand

Inspiriert durch das "Context Window Discipline"-Pattern:
- **Tool-Descriptions** enthalten nur das Minimum für den Agent: Was tut das Tool, welche Parameter gibt es
- **Domänenwissen** (CELEX-Schema, Suchstrategien, bekannte IDs) lebt im `eurlex_guide` Prompt
- Der Agent ruft den Prompt nur ab wenn er Kontext braucht — nicht bei jedem Tool-Call

### Tool 1: `eurlex_search`

**Input-Schema (Zod):**
```typescript
z.object({
  query: z.string().min(3).max(500)
    .describe("Suchbegriff, z.B. 'artificial intelligence high risk'"),
  resource_type: z.enum(["REG", "DIR", "DEC", "JUDG", "any"])
    .default("any")
    .describe("Dokumenttyp: REG=Verordnung, DIR=Richtlinie, DEC=Entscheidung, JUDG=Urteil"),
  language: z.enum(["DEU", "ENG", "FRA"])
    .default("DEU")
    .describe("Sprache für Titel und Volltext"),
  limit: z.number().int().min(1).max(50).default(10)
    .describe("Max. Ergebnisse"),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe("Filter ab Datum, Format: YYYY-MM-DD"),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe("Filter bis Datum, Format: YYYY-MM-DD"),
}).strict()
```

**Output:**
```typescript
{
  results: Array<{
    celex: string        // z.B. "32024R1689"
    title: string        // Titel in gewählter Sprache
    date: string         // Datum ISO
    type: string         // REG / DIR / DEC / JUDG / etc. (aus SPARQL-Query)
    eurlex_url: string   // https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32024R1689
  }>,
  total: number,
  query_used: string     // Verwendete SPARQL-Query (Transparenz für Agent — entspricht dry-run Pattern)
}
```

---

### Tool 2: `eurlex_fetch`

**Input-Schema (Zod):**
```typescript
z.object({
  celex_id: z.string()
    .regex(/^\d[A-Z0-9]{4,20}$/)
    .describe("CELEX-Identifier, z.B. '32024R1689' für den AI Act"),
  language: z.enum(["DEU", "ENG", "FRA"])
    .default("DEU")
    .describe("Sprache des Volltexts"),
  format: z.enum(["xhtml", "plain"])
    .default("xhtml")
    .describe("Ausgabeformat: xhtml=strukturiertes XHTML, plain=Text (XHTML-Tags entfernt)"),
  max_chars: z.number().int().min(1000).max(50000).default(20000)
    .describe("Maximale Zeichenanzahl des zurückgegebenen Texts"),
}).strict()
```

**Output:**
```typescript
{
  celex_id: string
  title: string
  language: string
  content: string       // Volltext (ggf. truncated)
  truncated: boolean
  char_count: number
  source_url: string
}
```

**Hinweis:** Für `format: "plain"` wird XHTML geholt und Tags werden serverseitig entfernt. Der Cellar-Endpoint liefert kein Plaintext direkt.

### Input-Hardening (Agent-Sicherheit)

Inspiriert durch "Adversarial Input Hardening" (vgl. CLI-for-AI-Agents):
Agents halluzinieren. Der Server muss damit umgehen.

**SPARQL-Injection-Schutz in `buildSparqlQuery()`:**
- Query-Parameter wird escaped: Anführungszeichen `"` → `\"`, Backslashes `\` → `\\`
- Keine String-Interpolation direkt in SPARQL — stattdessen Escape-Funktion

```typescript
function escapeSparqlString(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

// Verwendung im Query-Builder:
FILTER(CONTAINS(LCASE(STR(?title)), LCASE("${escapeSparqlString(params.query)}")))
```

**CELEX-ID-Validierung:**
- Zod-Regex `^\d[A-Z0-9]{4,20}$` verhindert Path-Traversal und Injection
- Zusätzlich: Keine `/`, `..`, `?`, `#` in CELEX-IDs erlaubt (durch Regex bereits abgedeckt)

---

## 6. TDD — Red/Green Cycle

### Philosophie

**Red → Green → Refactor.**
Kein Produktionscode ohne fehlschlagenden Test davor.

Jede Funktion durchläuft:
1. **RED:** Test schreiben → schlägt fehl (Funktion existiert nicht)
2. **GREEN:** Minimalimplementierung → Test grün
3. **REFACTOR:** Code verbessern → Tests bleiben grün

---

### 6.1 Test-Setup

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    mockReset: true,
  }
})
```

**Mock-Strategie:**
Cellar-API wird in Unit-Tests vollständig gemockt (kein Netzwerk).
Integration-Tests treffen echte Endpoints (separates `tests/integration/`-Verzeichnis).

---

### 6.2 Tests: CellarClient

**Datei:** `tests/cellarClient.test.ts`

#### RED-Phase: Tests schreiben

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CellarClient } from '../src/services/cellarClient'

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('CellarClient.sparqlQuery()', () => {
  beforeEach(() => mockFetch.mockReset())

  // RED 1: sparqlQuery gibt geparste Ergebnisse zurück
  it('gibt CELEX-IDs, Titel und Typ aus SPARQL-Response zurück', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: {
          bindings: [{
            celex: { value: '32024R1689' },
            title: { value: 'Verordnung über Künstliche Intelligenz' },
            date: { value: '2024-07-12' },
            resType: { value: 'REG' }
          }]
        }
      })
    })

    const client = new CellarClient()
    const result = await client.sparqlQuery('artificial intelligence')

    expect(result).toHaveLength(1)
    expect(result[0].celex).toBe('32024R1689')
    expect(result[0].title).toContain('Künstliche Intelligenz')
    expect(result[0].type).toBe('REG')
  })

  // RED 2: Leere Ergebnisse
  it('gibt leeres Array zurück wenn keine Treffer', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: { bindings: [] } })
    })

    const client = new CellarClient()
    const result = await client.sparqlQuery('xyznonexistent123')
    expect(result).toEqual([])
  })

  // RED 3: HTTP-Fehler
  it('wirft Fehler bei HTTP 500', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    const client = new CellarClient()
    await expect(client.sparqlQuery('test'))
      .rejects.toThrow('SPARQL endpoint error: 500')
  })

  // RED 4: Netzwerk-Fehler
  it('wirft Fehler bei Netzwerkausfall', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const client = new CellarClient()
    await expect(client.sparqlQuery('test'))
      .rejects.toThrow('Network error')
  })

  // RED 5: SPARQL wird per POST gesendet
  it('sendet SPARQL-Query per POST mit Content-Type application/sparql-query', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: { bindings: [] } })
    })

    const client = new CellarClient()
    await client.sparqlQuery('test')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/sparql-query'
        })
      })
    )
  })
})

describe('CellarClient.fetchDocument()', () => {
  beforeEach(() => mockFetch.mockReset())

  // RED 6: Volltext abrufen
  it('gibt XHTML-Volltext für gültige CELEX-ID zurück', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<div class="eli-main-title">AI Act Volltext...</div>'
    })

    const client = new CellarClient()
    const result = await client.fetchDocument('32024R1689', 'DEU')

    expect(result).toContain('AI Act')
  })

  // RED 7: Dokument nicht gefunden
  it('wirft Fehler bei unbekannter CELEX-ID (404)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    const client = new CellarClient()
    await expect(client.fetchDocument('99999X0000', 'DEU'))
      .rejects.toThrow('Document not found: 99999X0000')
  })

  // RED 8: Korrekte Headers werden gesetzt
  it('setzt Accept: application/xhtml+xml und Accept-Language korrekt', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => 'content'
    })

    const client = new CellarClient()
    await client.fetchDocument('32024R1689', 'ENG')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('32024R1689'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Accept': 'application/xhtml+xml',
          'Accept-Language': 'en'
        }),
        redirect: 'follow'
      })
    )
  })

  // RED 9: Accept-Language Mapping DEU → de
  it('mapped DEU auf Accept-Language: de', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => 'content'
    })

    const client = new CellarClient()
    await client.fetchDocument('32024R1689', 'DEU')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Accept-Language': 'de' })
      })
    )
  })
})

describe('CellarClient.buildSparqlQuery()', () => {
  // RED 10: Query-Builder mit Ressource-Typ
  it('inkludiert REG-Filter wenn resource_type=REG', () => {
    const client = new CellarClient()
    const query = client.buildSparqlQuery({
      query: 'test',
      resource_type: 'REG',
      language: 'DEU',
      limit: 10
    })
    expect(query).toContain('resource-type/REG')
  })

  // RED 11: Query-Builder ohne Typ-Filter
  it('hat keinen Typ-Filter wenn resource_type=any', () => {
    const client = new CellarClient()
    const query = client.buildSparqlQuery({
      query: 'test',
      resource_type: 'any',
      language: 'DEU',
      limit: 10
    })
    expect(query).not.toContain('work_has_resource-type')
  })

  // RED 12: Datumsfilter
  it('inkludiert Datumsfilter wenn date_from gesetzt', () => {
    const client = new CellarClient()
    const query = client.buildSparqlQuery({
      query: 'test',
      resource_type: 'any',
      language: 'DEU',
      limit: 10,
      date_from: '2020-01-01'
    })
    expect(query).toContain('2020-01-01')
    expect(query).toContain('FILTER')
  })

  // RED 13: Resource-Type wird aus Query extrahiert
  it('enthält BIND für resType-Extraktion', () => {
    const client = new CellarClient()
    const query = client.buildSparqlQuery({
      query: 'test',
      resource_type: 'any',
      language: 'DEU',
      limit: 10
    })
    expect(query).toContain('?resType')
    expect(query).toContain('BIND')
  })

  // RED 14: Titel-Triple ist required (nicht OPTIONAL) bei Titel-Suche
  it('hat Titel-Triple als required, nicht OPTIONAL', () => {
    const client = new CellarClient()
    const query = client.buildSparqlQuery({
      query: 'test',
      resource_type: 'any',
      language: 'DEU',
      limit: 10
    })
    // expression_title sollte NICHT in einem OPTIONAL-Block sein
    expect(query).toContain('expression_title ?title')
    // Der OPTIONAL-Block sollte nur für ?date sein
    const optionalMatches = query.match(/OPTIONAL/g) || []
    expect(optionalMatches.length).toBe(1) // nur für date
  })
})
```

#### GREEN-Phase: Minimale Implementierung

```typescript
// src/services/cellarClient.ts
import { SPARQL_ENDPOINT, CELLAR_REST_BASE } from '../constants.js'

const LANG_ACCEPT: Record<string, string> = {
  DEU: 'de', ENG: 'en', FRA: 'fr'
}

const LANG_URI: Record<string, string> = {
  DEU: 'DEU', ENG: 'ENG', FRA: 'FRA'
}

export interface SparqlQueryParams {
  query: string
  resource_type: string
  language: string
  limit: number
  date_from?: string
  date_to?: string
}

export interface SearchResult {
  celex: string
  title: string
  date: string
  type: string
  eurlex_url: string
}

export class CellarClient {
  buildSparqlQuery(params: SparqlQueryParams): string {
    const typeFilter = params.resource_type !== 'any'
      ? `?work cdm:work_has_resource-type
          <http://publications.europa.eu/resource/authority/resource-type/${params.resource_type}> .`
      : ''

    const dateFilters: string[] = []
    if (params.date_from) {
      dateFilters.push(`FILTER(?date >= "${params.date_from}"^^xsd:date)`)
    }
    if (params.date_to) {
      dateFilters.push(`FILTER(?date <= "${params.date_to}"^^xsd:date)`)
    }

    return `
      PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

      SELECT DISTINCT ?work ?celex ?title ?date ?resType WHERE {
        ${typeFilter}
        ?work cdm:resource_legal_id_celex ?celex .
        ?work cdm:work_has_resource-type ?resTypeUri .
        BIND(REPLACE(STR(?resTypeUri), "^.*/", "") AS ?resType)
        OPTIONAL { ?work cdm:work_date_document ?date . }
        ?expr cdm:expression_belongs_to_work ?work .
        ?expr cdm:expression_uses_language
              <http://publications.europa.eu/resource/authority/language/${LANG_URI[params.language]}> .
        ?expr cdm:expression_title ?title .
        FILTER(CONTAINS(LCASE(STR(?title)), LCASE("${params.query}")))
        ${dateFilters.join('\n        ')}
      }
      ORDER BY DESC(?date)
      LIMIT ${params.limit}
    `.trim()
  }

  async sparqlQuery(
    query: string,
    params: Partial<SparqlQueryParams> = {}
  ): Promise<SearchResult[]> {
    const fullParams: SparqlQueryParams = {
      query,
      resource_type: params.resource_type ?? 'any',
      language: params.language ?? 'DEU',
      limit: params.limit ?? 10,
      ...params
    }

    const sparql = this.buildSparqlQuery(fullParams)

    const response = await fetch(SPARQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-query',
        'Accept': 'application/sparql-results+json',
      },
      body: sparql,
    })

    if (!response.ok) {
      throw new Error(`SPARQL endpoint error: ${response.status}`)
    }

    const data = await response.json()
    const bindings = data.results?.bindings ?? []

    return bindings.map((b: Record<string, { value: string }>) => ({
      celex: b.celex?.value ?? '',
      title: b.title?.value ?? '(kein Titel)',
      date: b.date?.value ?? '',
      type: b.resType?.value ?? 'UNKNOWN',
      eurlex_url: `https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:${b.celex?.value}`
    }))
  }

  async fetchDocument(
    celex_id: string,
    language: string
  ): Promise<string> {
    const url = `${CELLAR_REST_BASE}/${celex_id}`

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/xhtml+xml',
        'Accept-Language': LANG_ACCEPT[language] ?? 'de'
      },
      redirect: 'follow'
    })

    if (response.status === 404) {
      throw new Error(`Document not found: ${celex_id}`)
    }

    if (!response.ok) {
      throw new Error(`Fetch error: ${response.status}`)
    }

    return response.text()
  }
}
```

---

### 6.3 Tests: Tools

**Datei:** `tests/search.tool.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest'
import { CellarClient } from '../src/services/cellarClient'

vi.mock('../src/services/cellarClient')

describe('eurlex_search Tool', () => {
  // RED 15: Erfolgreiche Suche gibt formatierte Ergebnisse zurück
  it('gibt Markdown-Liste bei Ergebnissen zurück', async () => {
    const mockSearch = vi.mocked(CellarClient.prototype.sparqlQuery)
    mockSearch.mockResolvedValueOnce([{
      celex: '32024R1689',
      title: 'KI-Verordnung',
      date: '2024-07-12',
      type: 'REG',
      eurlex_url: 'https://eur-lex.europa.eu/...'
    }])

    const { handleEurlexSearch } = await import('../src/tools/search')
    const result = await handleEurlexSearch({
      query: 'artificial intelligence',
      resource_type: 'REG',
      language: 'DEU',
      limit: 10
    })

    expect(result.content[0].text).toContain('32024R1689')
    expect(result.content[0].text).toContain('KI-Verordnung')
  })

  // RED 16: Keine Ergebnisse → hilfreiche Fehlermeldung
  it('gibt klare Meldung bei leerer Suche', async () => {
    const mockSearch = vi.mocked(CellarClient.prototype.sparqlQuery)
    mockSearch.mockResolvedValueOnce([])

    const { handleEurlexSearch } = await import('../src/tools/search')
    const result = await handleEurlexSearch({
      query: 'xyznotfound',
      resource_type: 'any',
      language: 'DEU',
      limit: 10
    })

    expect(result.content[0].text).toContain('Keine Ergebnisse')
  })

  // RED 17: API-Fehler → strukturierte Fehlermeldung
  it('gibt actionable Fehlermeldung bei API-Ausfall', async () => {
    const mockSearch = vi.mocked(CellarClient.prototype.sparqlQuery)
    mockSearch.mockRejectedValueOnce(new Error('SPARQL endpoint error: 503'))

    const { handleEurlexSearch } = await import('../src/tools/search')
    const result = await handleEurlexSearch({
      query: 'test',
      resource_type: 'any',
      language: 'DEU',
      limit: 10
    })

    expect(result.content[0].text).toContain('Error')
    expect(result.isError).toBe(true)
  })
})
```

**Datei:** `tests/fetch.tool.test.ts`

```typescript
describe('eurlex_fetch Tool', () => {
  // RED 18: Volltext wird zurückgegeben und auf max_chars limitiert
  it('truncated=true wenn Content max_chars überschreitet', async () => {
    const longContent = 'x'.repeat(25000)
    const mockFetch = vi.mocked(CellarClient.prototype.fetchDocument)
    mockFetch.mockResolvedValueOnce(longContent)

    const { handleEurlexFetch } = await import('../src/tools/fetch')
    const result = await handleEurlexFetch({
      celex_id: '32024R1689',
      language: 'DEU',
      format: 'xhtml',
      max_chars: 20000
    })

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.truncated).toBe(true)
    expect(parsed.content.length).toBeLessThanOrEqual(20000)
  })

  // RED 19: CELEX-Validierung schlägt fehl bei ungültigem Format
  it('wirft Zod-Fehler bei ungültiger CELEX-ID', async () => {
    const { handleEurlexFetch } = await import('../src/tools/fetch')
    await expect(handleEurlexFetch({
      celex_id: 'INVALID!!!',
      language: 'DEU',
      format: 'xhtml',
      max_chars: 20000
    })).rejects.toThrow()
  })

  // RED 20: Plain-Format entfernt XHTML-Tags
  it('entfernt XHTML-Tags wenn format=plain', async () => {
    const xhtmlContent = '<div><p>Artikel 1: Gegenstand</p></div>'
    const mockFetch = vi.mocked(CellarClient.prototype.fetchDocument)
    mockFetch.mockResolvedValueOnce(xhtmlContent)

    const { handleEurlexFetch } = await import('../src/tools/fetch')
    const result = await handleEurlexFetch({
      celex_id: '32024R1689',
      language: 'DEU',
      format: 'plain',
      max_chars: 20000
    })

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.content).not.toContain('<div>')
    expect(parsed.content).toContain('Artikel 1')
  })
})
```

---

### 6.4 Integration-Tests

```typescript
// tests/integration/live.test.ts
// Nur ausführen mit: vitest run tests/integration

describe('Live Cellar API', () => {
  it('findet AI Act via SPARQL POST', async () => {
    const client = new CellarClient()
    const results = await client.sparqlQuery('künstliche intelligenz', {
      resource_type: 'REG', language: 'DEU', limit: 5
    })
    const aiAct = results.find(r => r.celex.startsWith('32024R1689'))
    expect(aiAct).toBeDefined()
    expect(aiAct?.type).toBe('REG')
  }, 15000)

  it('fetcht AI Act Volltext als XHTML', async () => {
    const client = new CellarClient()
    const content = await client.fetchDocument('32024R1689', 'DEU')
    expect(content.length).toBeGreaterThan(1000)
    expect(content).toContain('class=')  // XHTML hat CSS-Klassen
  }, 30000)

  it('fetcht DSGVO Volltext auf Englisch', async () => {
    const client = new CellarClient()
    const content = await client.fetchDocument('32016R0679', 'ENG')
    expect(content.length).toBeGreaterThan(1000)
  }, 30000)
})
```

---

## 7. Vollständige Implementierung

### `src/constants.ts`

```typescript
export const SPARQL_ENDPOINT = 'https://publications.europa.eu/webapi/rdf/sparql'
export const CELLAR_REST_BASE = 'https://publications.europa.eu/resource/celex'
export const EURLEX_BASE = 'https://eur-lex.europa.eu/legal-content'
export const DEFAULT_LANGUAGE = 'DEU'
export const DEFAULT_LIMIT = 10
export const MAX_CHARS_DEFAULT = 20000
export const MAX_CHARS_LIMIT = 50000
export const REQUEST_TIMEOUT_MS = 30000
```

### `src/index.ts` (Einstiegspunkt)

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { randomUUID } from 'node:crypto'
import express from 'express'
import { registerSearchTool } from './tools/search.js'
import { registerFetchTool } from './tools/fetch.js'

// Factory: neuer McpServer pro Session (gemäß offiziellem SDK-Beispiel)
function createServer(): McpServer {
  const server = new McpServer({
    name: 'eurlex-mcp-server',
    version: '1.0.0'
  })
  registerSearchTool(server)
  registerFetchTool(server)
  return server
}

async function runHTTP() {
  const app = express()
  app.use(express.json())

  const transports: Record<string, StreamableHTTPServerTransport> = {}

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined

    if (sessionId && transports[sessionId]) {
      // Bestehende Session wiederverwenden
      await transports[sessionId].handleRequest(req, res, req.body)
      return
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      // Neue Session
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport
        }
      })

      transport.onclose = () => {
        const sid = transport.sessionId
        if (sid && transports[sid]) {
          delete transports[sid]
        }
      }

      const server = createServer()
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
      return
    }

    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
      id: null
    })
  })

  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID')
      return
    }
    await transports[sessionId].handleRequest(req, res)
  })

  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID')
      return
    }
    await transports[sessionId].handleRequest(req, res)
  })

  app.get('/health', (_, res) => res.json({ status: 'ok', server: 'eurlex-mcp-server' }))

  const port = parseInt(process.env.PORT || '3001')
  app.listen(port, () => {
    console.error(`eurlex-mcp-server running on http://localhost:${port}/mcp`)
  })
}

async function runStdio() {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

const transport = process.env.TRANSPORT || 'stdio'
if (transport === 'http') {
  runHTTP().catch(console.error)
} else {
  runStdio().catch(console.error)
}
```

### `package.json`

```json
{
  "name": "eurlex-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run tests/integration"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.27.0",
    "express": "^4.18.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.3.0",
    "vitest": "^2.0.0"
  }
}
```

---

## 8. Validierungsmatrix

| # | Was wird validiert | Methode | Erwartetes Ergebnis |
|---|---|---|---|
| V1 | SPARQL Endpoint erreichbar (POST) | Integration-Test | HTTP 200, JSON |
| V2 | AI Act auffindbar via Titel-Suche | Integration-Test | CELEX `32024R1689` in Results |
| V3 | DSGVO auffindbar | Integration-Test | CELEX `32016R0679` |
| V4 | Volltext AI Act abrufbar (DE, XHTML) | Integration-Test | Content >10.000 Zeichen |
| V5 | Volltext abrufbar (EN, XHTML) | Integration-Test | Content >10.000 Zeichen |
| V6 | max_chars wird eingehalten | Unit-Test | `content.length <= max_chars` |
| V7 | Ungültige CELEX-ID → 404-Handling | Unit-Test | Error mit CELEX-ID in Meldung |
| V8 | SPARQL-Query inkl. Typ-Filter korrekt | Unit-Test | Query enthält Resource-Type URI |
| V9 | Datum-Filter korrekt generiert | Unit-Test | Query enthält FILTER + Datum |
| V10 | Accept: application/xhtml+xml gesetzt | Unit-Test | Header korrekt |
| V11 | Accept-Language: de/en/fr gesetzt | Unit-Test | ISO 639-1 Mapping korrekt |
| V12 | Resource-Type aus SPARQL-Query (BIND) | Unit-Test | `type` = REG/DIR/etc. aus Result |
| V13 | SPARQL per POST, nicht GET | Unit-Test | fetch mit method: 'POST' |
| V14 | Redirect-Following bei Fetch | Unit-Test | `redirect: 'follow'` in Options |
| V15 | Plain-Format entfernt Tags | Unit-Test | Kein `<div>` in Content |
| V16 | MCP Tool-Registrierung erfolgreich | Build-Test | `pnpm run build` ohne Fehler |
| V17 | Server startet und antwortet | Smoke-Test | GET /health → `{"status":"ok"}` |
| V18 | MCP Inspector zeigt 2 Tools | Manuell | `eurlex_search` + `eurlex_fetch` |
| V19 | Claude kann AI Act-Fragen beantworten | E2E-Manuell | Korrekte Antwort auf "Was regelt Art. 6?" |
| V20 | Session-Management funktioniert | Smoke-Test | Mcp-Session-Id Header in Response |
| V21 | SPARQL-Injection wird escaped | Unit-Test | Query mit `"` und `\` im Suchbegriff → kein SPARQL-Syntax-Error |
| V22 | eurlex_guide Prompt abrufbar | Smoke-Test | MCP Inspector zeigt Prompt mit CELEX-Guide |

---

## 9. Definition of Done

### Pro Tool (eurlex_search & eurlex_fetch)
- [ ] Alle Unit-Tests grün (RED→GREEN vollständig durchlaufen)
- [ ] Zod-Schema mit `.strict()` und sinnvollen Constraints
- [ ] Tool-Description: schlank, nur was der Agent zum Aufrufen braucht (Domänenwissen → Prompt)
- [ ] Annotations gesetzt: `readOnlyHint: true, destructiveHint: false`
- [ ] Error-Handling: API-Fehler → `isError: true` + actionable Meldung
- [ ] Input-Hardening: SPARQL-Injection escaped, CELEX-ID validiert

### Server gesamt
- [ ] `pnpm run build` ohne TypeScript-Fehler
- [ ] `pnpm test` → alle Unit-Tests grün
- [ ] Integration-Tests: alle Live-Validierungen bestanden
- [ ] `/health` Endpoint antwortet
- [ ] MCP Inspector zeigt 2 Tools + 1 Prompt (`eurlex_guide`)
- [ ] Keine `any`-Types im Produktionscode
- [ ] Session-Management gemäß offiziellem SDK-Pattern

### Deployment (Hetzner/Coolify)
- [ ] Dockerfile vorhanden
- [ ] `TRANSPORT=http` Env-Variable konfiguriert
- [ ] Server im Coolify deployed und `/health` erreichbar
- [ ] claude.ai MCP-Config eingetragen und getestet

### Qualität
- [ ] Kein duplizierter Code zwischen search.ts und fetch.ts
- [ ] `CellarClient` ist die einzige Klasse die HTTP-Calls macht
- [ ] README enthält: Setup, Konfiguration, Beispiel-Queries, CELEX-Schema-Erklärung
- [ ] Test-Coverage: >80% für `cellarClient.ts`

---

## 10. Deployment

### Dockerfile

```dockerfile
FROM node:20-alpine
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY dist/ ./dist/
ENV TRANSPORT=http
ENV PORT=3001
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

### Coolify Konfiguration

```yaml
# Environment Variables
TRANSPORT: http
PORT: 3001
NODE_ENV: production
```

### claude.ai MCP Config

```json
{
  "mcpServers": {
    "eurlex": {
      "type": "url",
      "url": "https://eurlex-mcp.deinserver.example.com/mcp",
      "name": "eurlex-mcp"
    }
  }
}
```

---

## 11. Reihenfolge der Umsetzung

### Phase 1: Foundation
> **Meilenstein:** Projekt kompiliert, Testframework läuft

| # | Schritt | Artefakte |
|---|---|---|
| 1 | Projekt-Setup (package.json, tsconfig, vitest.config) | Config-Dateien |
| 2 | constants.ts + types.ts | `src/constants.ts`, `src/types.ts` |

**Check:** `pnpm run build` kompiliert ohne Fehler, `pnpm test` läuft (0 Tests)

---

### Phase 2: Core (CellarClient)
> **Meilenstein:** `pnpm test` grün für alle Client-Tests (Tests 1-14 + V21)

| # | Schritt | Artefakte |
|---|---|---|
| 3 | RED: cellarClient.test.ts schreiben (Tests 1-14 + V21) | `tests/cellarClient.test.ts` |
| 4 | GREEN: cellarClient.ts implementieren (inkl. `escapeSparqlString`) | `src/services/cellarClient.ts` |
| 5 | REFACTOR: CellarClient aufräumen | — |

**Check:** `pnpm test` → alle CellarClient-Tests grün

---

### Phase 3: Tools + Prompt
> **Meilenstein:** `pnpm test` komplett grün (Tests 1-20 + V21)

| # | Schritt | Artefakte |
|---|---|---|
| 6 | RED: search.tool.test.ts + fetch.tool.test.ts (Tests 15-20) | `tests/search.tool.test.ts`, `tests/fetch.tool.test.ts` |
| 7 | GREEN: tools/search.ts + tools/fetch.ts | `src/tools/search.ts`, `src/tools/fetch.ts` |
| 8 | prompts/guide.ts — eurlex_guide Prompt registrieren | `src/prompts/guide.ts` |

**Check:** `pnpm test` → alle Tests grün

---

### Phase 4: Server
> **Meilenstein:** `pnpm run build` erfolgreich, `/health` antwortet

| # | Schritt | Artefakte |
|---|---|---|
| 9 | index.ts + Server-Registration (Factory-Pattern + Prompt) | `src/index.ts` |
| 10 | pnpm run build → TypeScript-Fehler beheben | `dist/` |

**Check:** `pnpm run build` ohne Fehler, `curl localhost:3001/health` → `{"status":"ok"}`

---

### Phase 5: Validation
> **Meilenstein:** Alle Validierungen bestanden (V1-V5, V18, V22)

| # | Schritt | Validierungen |
|---|---|---|
| 11 | Integration-Tests ausführen | V1-V5 (Live Cellar API) |
| 12 | MCP Inspector testen | V18 (2 Tools) + V22 (1 Prompt) |

**Check:** `pnpm run test:integration` grün, MCP Inspector zeigt `eurlex_search`, `eurlex_fetch`, `eurlex_guide`

---

### Phase 6: Deploy
> **Meilenstein:** Server live erreichbar, claude.ai kann Tools nutzen

| # | Schritt | Artefakte |
|---|---|---|
| 13 | Dockerfile erstellen + testen | `Dockerfile` |
| 14 | Coolify Deployment + claude.ai MCP-Config | Prod-URL |

**Check:** `curl https://eurlex-mcp.{domain}/health` → `{"status":"ok"}`, claude.ai findet beide Tools

---

## 12. Bekannte Einschränkungen

| Einschränkung | Auswirkung | Mitigation |
|---|---|---|
| SPARQL sucht nur in Titeln, nicht Volltext | Findet Dokumente nur wenn Suchbegriff im Titel | Keyword-Normalisierung; EuroVoc-Suche als späteres Enhancement |
| `text/html` funktioniert nicht auf Cellar | Nur XHTML verfügbar | `Accept: application/xhtml+xml` verwenden (verifiziert) |
| EUR-Lex Frontend durch AWS WAF geschützt | eur-lex.europa.eu URLs nicht programmatisch abrufbar | Cellar REST API verwenden (kein WAF) |
| Cellar nutzt 303 Redirects (HTTP→HTTPS gemischt) | fetch muss Redirects folgen | `redirect: 'follow'` explizit setzen |
| Sehr lange Dokumente (AI Act: ~1.3 MB XHTML) | Überschreitet Claude-Context | `max_chars` + `truncated`-Flag |
| SPARQL-Antwortzeit: 2-10 Sekunden | Spürbare Latenz | Caching-Layer (optional, später) |
| Kein Rate-Limit dokumentiert | Unklar ob 429s möglich | Exponential Backoff bei Retry |
| `bif:contains` unzuverlässig bei Sprachmix | Schnelle Suche nur bei passender Sprache | `FILTER(CONTAINS(...))` verwenden (langsamer, aber robuster) |
| Nicht alle Dokumente haben XHTML-Version | Manche existieren nur als PDF | Fallback auf PDF → pdf-parse (späteres Enhancement) |
| MCP SDK v2 in Entwicklung (pre-alpha) | Paketname wird sich ändern (@modelcontextprotocol/server) | v1.x nutzen; Migration planen wenn v2 stabil |

---

## 13. Änderungsprotokoll (Research-basiert)

Folgende Änderungen wurden nach technischer Recherche und Live-Verifizierung (2026-03-05) vorgenommen:

| # | Bereich | Vorher | Nachher | Begründung |
|---|---|---|---|---|
| 1 | Fetch Accept-Header | `text/html` | `application/xhtml+xml` | `text/html` liefert HTTP 400/404 (live verifiziert) |
| 2 | Accept-Language | ISO 639-3 (`deu`) | ISO 639-1 (`de`) | Live-Test bestätigt `de`/`en`/`fr` funktionieren |
| 3 | SDK Version | `^1.0.0` | `^1.27.0` | Aktuelle Version ist 1.27.1; StreamableHTTP erst ab v1.2.0 |
| 4 | Server-Pattern | Globaler McpServer | Factory `createServer()` pro Session | Offizielles SDK-Beispiel zeigt neuen Server pro Session |
| 5 | SPARQL HTTP-Methode | GET | POST | URL-Längenlimits vermeiden; robuster |
| 6 | Resource-Type in Result | Aus Input-Param | Via `BIND(REPLACE(...))` aus SPARQL | Korrekter Typ auch bei `resource_type=any` |
| 7 | Titel-Triple | OPTIONAL | Required bei Titel-Suche | OPTIONAL + FILTER darauf ist widersprüchlich |
| 8 | Format-Option | `html`/`plain` | `xhtml`/`plain` | Cellar liefert XHTML, nicht HTML |
| 9 | fetchDocument Signatur | 3 Parameter (inkl. format) | 2 Parameter (celex_id, language) | Cellar liefert immer XHTML; Format-Konversion im Tool |
| 10 | HTTP-Endpoint | Nur POST /mcp | POST + GET + DELETE /mcp | Gemäß MCP Spec für Session-Management |
| 11 | EUR-Lex Frontend-URLs | Als Fetch-Quelle | Nur als Referenz-Link in Search-Results | AWS WAF blockiert programmatischen Zugriff |
| 12 | Agent-Kontext | Alles in Tool-Descriptions | MCP Prompt `eurlex_guide` für on-demand Domänenwissen | Context Window Discipline (CLI-for-AI-Agents Pattern) |
| 13 | Input-Hardening | Keine Escape-Logik | `escapeSparqlString()` für SPARQL-Injection-Schutz | Agents halluzinieren — Adversarial Input Hardening |
| 14 | CLI-Layer | Nicht evaluiert | Bewusst kein CLI — MCP Abstraction Tax zu niedrig bei 2 Tools | Kein Mehrwert für CLI-Binary bei diesem API-Surface |
