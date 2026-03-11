# EUR-Lex MCP Server — New Tools Expansion Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the EUR-Lex MCP server from 2 tools to 7 tools, unlocking metadata queries, legal citations, EuroVoc thematic search, consolidated texts, and enhanced search capabilities — all using the free SPARQL/REST APIs.

**Architecture:** Each new tool follows the existing pattern: Zod schema → handler function → CellarClient method → MCP server registration. New SPARQL query builders are added to CellarClient. Each phase is independently deployable and tested.

**Tech Stack:** TypeScript, Vitest, Zod, MCP SDK, SPARQL (EU Publications Office endpoint)

---

## File Structure Map

### New files to CREATE per phase:

**Phase 7 (Metadata):**
- `src/schemas/metadataSchema.ts` — Zod schema for eurlex_metadata input
- `src/tools/metadata.ts` — Handler + registration for eurlex_metadata tool
- `tests/metadata.tool.test.ts` — Unit tests for metadata handler
- `tests/cellarClient.metadata.test.ts` — SPARQL query builder + executor tests

**Phase 8 (Citations):**
- `src/schemas/citationsSchema.ts` — Zod schema for eurlex_citations input
- `src/tools/citations.ts` — Handler + registration for eurlex_citations tool
- `tests/citations.tool.test.ts` — Unit tests for citations handler
- `tests/cellarClient.citations.test.ts` — SPARQL query builder + executor tests

**Phase 9 (EuroVoc Search):**
- `src/schemas/eurovocSchema.ts` — Zod schema for eurlex_by_eurovoc input
- `src/tools/eurovoc.ts` — Handler + registration for eurlex_by_eurovoc tool
- `tests/eurovoc.tool.test.ts` — Unit tests for eurovoc handler
- `tests/cellarClient.eurovoc.test.ts` — SPARQL query builder + executor tests

**Phase 10 (Consolidated Text):**
- `src/schemas/consolidatedSchema.ts` — Zod schema for eurlex_consolidated input
- `src/tools/consolidated.ts` — Handler + registration for eurlex_consolidated tool
- `tests/consolidated.tool.test.ts` — Unit tests for consolidated handler

**Phase 11 (Enhanced Search):**
- No new files — modifies existing `src/schemas/searchSchema.ts`, `src/services/cellarClient.ts`, `src/tools/search.ts`
- `tests/cellarClient.enhanced-search.test.ts` — Tests for new search capabilities

### Files to MODIFY:

- `src/index.ts` — Add `registerXxxTool(server)` calls for each new tool (one per phase)
- `src/services/cellarClient.ts` — Add new SPARQL query builder methods (Phases 7-9, 11)
- `src/types.ts` — Add new result interfaces (each phase)
- `src/prompts/guide.ts` — Update guide with new tool descriptions (Phase 12)
- `tests/smoke.test.ts` — Update tool count assertion (each phase)

---

## Chunk 1: Phase 7 — eurlex_metadata Tool

### Task 7.1: MetadataResult type + Zod schema

**Files:**
- Modify: `src/types.ts`
- Create: `src/schemas/metadataSchema.ts`

- [ ] **Step 1: Write the failing test for schema validation**

Create `tests/metadataSchema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { metadataSchema } from '../src/schemas/metadataSchema.js'

describe('metadataSchema', () => {
  it('M1 – accepts valid CELEX-ID with defaults', () => {
    const result = metadataSchema.parse({ celex_id: '32024R1689' })
    expect(result.celex_id).toBe('32024R1689')
    expect(result.language).toBe('DEU')
  })

  it('M2 – rejects invalid CELEX-ID', () => {
    expect(() => metadataSchema.parse({ celex_id: 'invalid' })).toThrow()
  })

  it('M3 – accepts ENG language override', () => {
    const result = metadataSchema.parse({ celex_id: '32024R1689', language: 'ENG' })
    expect(result.language).toBe('ENG')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/metadataSchema.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Add MetadataResult type**

In `src/types.ts`, append:

```typescript
export interface MetadataResult {
  celex_id: string
  title: string
  date_document: string
  date_entry_into_force: string
  date_end_of_validity: string
  in_force: boolean | null
  date_transposition: string
  resource_type: string
  authors: string[]
  eurovoc_concepts: string[]
  directory_codes: string[]
  eurlex_url: string
}
```

- [ ] **Step 4: Create metadataSchema.ts**

Create `src/schemas/metadataSchema.ts`:

```typescript
import { z } from 'zod'

export const metadataSchema = z.object({
  celex_id: z.string()
    .regex(/^\d[A-Z0-9]{4,20}$/)
    .describe("CELEX-Identifier, z.B. '32024R1689' für den AI Act"),
  language: z.enum(['DEU', 'ENG', 'FRA'])
    .default('DEU')
    .describe('Sprache für Titel und Labels'),
}).strict()

export type MetadataInput = z.infer<typeof metadataSchema>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/metadataSchema.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/schemas/metadataSchema.ts tests/metadataSchema.test.ts
git commit -m "feat(metadata): add MetadataResult type and Zod schema"
```

---

### Task 7.2: CellarClient.buildMetadataQuery() + metadataQuery()

**Files:**
- Modify: `src/services/cellarClient.ts`
- Create: `tests/cellarClient.metadata.test.ts`

- [ ] **Step 1: Write the failing test for SPARQL query builder**

Create `tests/cellarClient.metadata.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CellarClient } from '../src/services/cellarClient.js'

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})

describe('buildMetadataQuery()', () => {
  it('M4 – generates SPARQL with CELEX filter and all metadata properties', () => {
    const client = new CellarClient()
    const sparql = client.buildMetadataQuery('32024R1689', 'DEU')

    expect(sparql).toContain('32024R1689')
    expect(sparql).toContain('resource_legal_id_celex')
    expect(sparql).toContain('resource_legal_date_entry-into-force')
    expect(sparql).toContain('resource_legal_in-force')
    expect(sparql).toContain('work_is_about_concept_eurovoc')
    expect(sparql).toContain('work_created_by_agent')
    expect(sparql).toContain('expression_title')
  })

  it('M5 – includes date_end_of_validity and directive_date_transposition', () => {
    const client = new CellarClient()
    const sparql = client.buildMetadataQuery('32022L2555', 'DEU')

    expect(sparql).toContain('resource_legal_date_end-of-validity')
    expect(sparql).toContain('directive_date_transposition')
  })
})

describe('metadataQuery()', () => {
  it('M6 – returns MetadataResult with all fields populated', async () => {
    const sparqlResponse = {
      results: {
        bindings: [{
          celex: { type: 'literal', value: '32024R1689' },
          title: { type: 'literal', value: 'Verordnung über künstliche Intelligenz' },
          dateDoc: { type: 'literal', value: '2024-06-13' },
          dateForce: { type: 'literal', value: '2024-08-01' },
          dateEnd: { type: 'literal', value: '' },
          inForce: { type: 'literal', value: 'true' },
          dateTrans: { type: 'literal', value: '' },
          resType: { type: 'literal', value: 'REG' },
          authors: { type: 'literal', value: 'EP||CONSIL' },
          eurovoc: { type: 'literal', value: 'artificial intelligence||high technology' },
          dirCodes: { type: 'literal', value: '16.30' },
        }],
      },
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sparqlResponse,
    })

    const client = new CellarClient()
    const result = await client.metadataQuery('32024R1689', 'DEU')

    expect(result).toMatchObject({
      celex_id: '32024R1689',
      title: 'Verordnung über künstliche Intelligenz',
      date_document: '2024-06-13',
      date_entry_into_force: '2024-08-01',
      in_force: true,
      resource_type: 'REG',
    })
    expect(result.authors).toContain('EP')
    expect(result.eurovoc_concepts).toContain('artificial intelligence')
  })

  it('M7 – returns null for in_force when not available', async () => {
    const sparqlResponse = {
      results: {
        bindings: [{
          celex: { type: 'literal', value: '32024R1689' },
          title: { type: 'literal', value: 'Test' },
          dateDoc: { type: 'literal', value: '2024-01-01' },
          resType: { type: 'literal', value: 'REG' },
          authors: { type: 'literal', value: '' },
          eurovoc: { type: 'literal', value: '' },
          dirCodes: { type: 'literal', value: '' },
        }],
      },
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sparqlResponse,
    })

    const client = new CellarClient()
    const result = await client.metadataQuery('32024R1689', 'DEU')
    expect(result.in_force).toBeNull()
  })

  it('M8 – throws when CELEX not found (empty bindings)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: { bindings: [] } }),
    })

    const client = new CellarClient()
    await expect(client.metadataQuery('99999X9999', 'DEU')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/cellarClient.metadata.test.ts`
Expected: FAIL — buildMetadataQuery is not a function

- [ ] **Step 3: Implement buildMetadataQuery() and metadataQuery()**

In `src/services/cellarClient.ts`, add to the `CellarClient` class:

```typescript
  buildMetadataQuery(celexId: string, language: string): string {
    const lang = LANGUAGE_URI_MAP[language] ?? language
    const escaped = escapeSparqlString(celexId)

    return [
      'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>',
      'PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>',
      '',
      'SELECT ?celex ?title ?dateDoc ?dateForce ?dateEnd ?inForce ?dateTrans ?resType',
      '       (GROUP_CONCAT(DISTINCT ?authorName; separator="||") AS ?authors)',
      '       (GROUP_CONCAT(DISTINCT ?evLabel; separator="||") AS ?eurovoc)',
      '       (GROUP_CONCAT(DISTINCT ?dirCode; separator="||") AS ?dirCodes)',
      'WHERE {',
      `  ?work cdm:resource_legal_id_celex "${escaped}" .`,
      '  ?work cdm:resource_legal_id_celex ?celex .',
      '  ?work cdm:work_has_resource-type ?resTypeUri .',
      '  BIND(REPLACE(STR(?resTypeUri), "^.*/", "") AS ?resType)',
      `  ?expr cdm:expression_belongs_to_work ?work .`,
      `  ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/${lang}> .`,
      '  ?expr cdm:expression_title ?title .',
      '  OPTIONAL { ?work cdm:work_date_document ?dateDoc . }',
      '  OPTIONAL { ?work cdm:resource_legal_date_entry-into-force ?dateForce . }',
      '  OPTIONAL { ?work cdm:resource_legal_date_end-of-validity ?dateEnd . }',
      '  OPTIONAL { ?work cdm:resource_legal_in-force ?inForce . }',
      '  OPTIONAL { ?work cdm:directive_date_transposition ?dateTrans . }',
      '  OPTIONAL {',
      '    ?work cdm:work_created_by_agent ?author .',
      '    ?author cdm:agent_name ?authorName .',
      '  }',
      '  OPTIONAL {',
      '    ?work cdm:work_is_about_concept_eurovoc ?evConcept .',
      `    ?evConcept skos:prefLabel ?evLabel .`,
      `    FILTER(LANG(?evLabel) = "${LANGUAGE_HTTP_MAP[language] ?? 'de'}")`,
      '  }',
      '  OPTIONAL {',
      '    ?work cdm:resource_legal_is_about_concept_directory-code ?dirCodeUri .',
      '    BIND(REPLACE(STR(?dirCodeUri), "^.*/", "") AS ?dirCode)',
      '  }',
      '}',
      'GROUP BY ?celex ?title ?dateDoc ?dateForce ?dateEnd ?inForce ?dateTrans ?resType',
      'LIMIT 1',
    ].join('\n')
  }

  async metadataQuery(celexId: string, language: string): Promise<MetadataResult> {
    const sparql = this.buildMetadataQuery(celexId, language)

    const response = await fetch(SPARQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-query',
        Accept: 'application/sparql-results+json',
      },
      body: sparql,
    })

    if (!response.ok) {
      throw new Error(`SPARQL endpoint error: ${response.status}`)
    }

    const data = await response.json()
    const bindings = data.results.bindings

    if (bindings.length === 0) {
      throw new Error(`No metadata found for CELEX: ${celexId}`)
    }

    const b = bindings[0]
    const httpLang = LANGUAGE_HTTP_MAP[language] ?? 'de'
    const splitField = (val: string | undefined) =>
      val ? val.split('||').filter(Boolean) : []

    return {
      celex_id: b.celex.value,
      title: b.title.value,
      date_document: b.dateDoc?.value ?? '',
      date_entry_into_force: b.dateForce?.value ?? '',
      date_end_of_validity: b.dateEnd?.value ?? '',
      in_force: b.inForce ? b.inForce.value === 'true' : null,
      date_transposition: b.dateTrans?.value ?? '',
      resource_type: b.resType.value,
      authors: splitField(b.authors?.value),
      eurovoc_concepts: splitField(b.eurovoc?.value),
      directory_codes: splitField(b.dirCodes?.value),
      eurlex_url: `${EURLEX_BASE}/${httpLang.toUpperCase()}/ALL/?uri=CELEX:${celexId}`,
    }
  }
```

Also add imports at top of cellarClient.ts:
```typescript
import type { SparqlQueryParams, SearchResult, MetadataResult } from '../types.js'
```

And add `PREFIX skos: <http://www.w3.org/2004/02/skos/core#>` to the SPARQL query.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/cellarClient.metadata.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/cellarClient.ts tests/cellarClient.metadata.test.ts
git commit -m "feat(metadata): add buildMetadataQuery and metadataQuery to CellarClient"
```

---

### Task 7.3: eurlex_metadata tool handler + registration

**Files:**
- Create: `src/tools/metadata.ts`
- Create: `tests/metadata.tool.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing test for tool handler**

Create `tests/metadata.tool.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockMetadataQuery = vi.fn()
vi.mock('../src/services/cellarClient.js', () => ({
  CellarClient: vi.fn().mockImplementation(() => ({
    metadataQuery: mockMetadataQuery,
  })),
}))

import { handleEurlexMetadata } from '../src/tools/metadata.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleEurlexMetadata()', () => {
  const mockResult = {
    celex_id: '32024R1689',
    title: 'AI Act',
    date_document: '2024-06-13',
    date_entry_into_force: '2024-08-01',
    date_end_of_validity: '',
    in_force: true,
    date_transposition: '',
    resource_type: 'REG',
    authors: ['EP', 'CONSIL'],
    eurovoc_concepts: ['artificial intelligence'],
    directory_codes: ['16.30'],
    eurlex_url: 'https://eur-lex.europa.eu/legal-content/DE/ALL/?uri=CELEX:32024R1689',
  }

  it('M9 – returns metadata as JSON in MCP content format', async () => {
    mockMetadataQuery.mockResolvedValueOnce(mockResult)

    const result = await handleEurlexMetadata({ celex_id: '32024R1689', language: 'DEU' })
    const parsed = JSON.parse(result.content[0].text)

    expect(parsed.celex_id).toBe('32024R1689')
    expect(parsed.in_force).toBe(true)
    expect(parsed.authors).toContain('EP')
  })

  it('M10 – returns isError on failure', async () => {
    mockMetadataQuery.mockRejectedValueOnce(new Error('Not found'))

    const result = await handleEurlexMetadata({ celex_id: '99999X9999', language: 'DEU' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Not found')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/metadata.tool.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create metadata tool handler**

Create `src/tools/metadata.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CellarClient } from '../services/cellarClient.js'
import { metadataSchema } from '../schemas/metadataSchema.js'

export async function handleEurlexMetadata(input: {
  celex_id: string
  language: string
}) {
  try {
    const parsed = metadataSchema.parse(input)
    const client = new CellarClient()
    const result = await client.metadataQuery(parsed.celex_id, parsed.language)

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result),
      }],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
      isError: true,
    }
  }
}

export function registerMetadataTool(server: McpServer) {
  server.tool(
    'eurlex_metadata',
    'Ruft Metadaten eines EU-Rechtsakts ab: Inkrafttreten, Gültigkeit, Autoren, EuroVoc-Themen',
    metadataSchema.shape,
    { readOnlyHint: true, destructiveHint: false },
    async (params) => handleEurlexMetadata(params)
  )
}
```

- [ ] **Step 4: Register tool in index.ts**

In `src/index.ts`, add import and registration:

```typescript
import { registerMetadataTool } from './tools/metadata.js'

// Inside createServer():
registerMetadataTool(server)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/metadata.tool.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Update smoke test tool count**

In `tests/smoke.test.ts`, update the tool name assertion:

```typescript
expect(toolNames).toEqual(['eurlex_fetch', 'eurlex_metadata', 'eurlex_search'])
```

- [ ] **Step 7: Run full test suite**

Run: `pnpm vitest run`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add src/tools/metadata.ts src/index.ts tests/metadata.tool.test.ts tests/smoke.test.ts
git commit -m "feat(metadata): add eurlex_metadata tool with handler and registration"
```

---

### Task 7.4: Live integration test for metadata

**Files:**
- Modify: `tests/integration/live.test.ts`

- [ ] **Step 1: Write integration test**

Append to `tests/integration/live.test.ts`:

```typescript
describe('metadataQuery()', () => {
  it('M-LIVE-1: returns metadata for AI Act (32024R1689)', async () => {
    const result = await client.metadataQuery('32024R1689', 'DEU')

    expect(result.celex_id).toBe('32024R1689')
    expect(result.title).toBeTruthy()
    expect(result.resource_type).toBe('REG')
    expect(result.date_document).toBeTruthy()
    expect(result.authors.length).toBeGreaterThan(0)
    expect(result.eurovoc_concepts.length).toBeGreaterThan(0)
  }, TIMEOUT)
})
```

- [ ] **Step 2: Run integration test**

Run: `pnpm vitest run tests/integration/live.test.ts`
Expected: PASS (may take 30-60s)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/live.test.ts
git commit -m "test(metadata): add live integration test for metadataQuery"
```

**Definition of Done Phase 7:**
- [ ] `metadataSchema` validates CELEX-ID + language
- [ ] `CellarClient.buildMetadataQuery()` generates correct SPARQL
- [ ] `CellarClient.metadataQuery()` returns `MetadataResult`
- [ ] `handleEurlexMetadata()` returns MCP-formatted response
- [ ] Tool registered as `eurlex_metadata` in server
- [ ] Smoke test updated with new tool count
- [ ] Live integration test passes against real API
- [ ] All existing tests still pass
- [ ] 10+ new unit tests, all green

---

## Chunk 2: Phase 8 — eurlex_citations Tool

### Task 8.1: CitationsResult type + Zod schema

**Files:**
- Modify: `src/types.ts`
- Create: `src/schemas/citationsSchema.ts`
- Create: `tests/citationsSchema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/citationsSchema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { citationsSchema } from '../src/schemas/citationsSchema.js'

describe('citationsSchema', () => {
  it('C1 – accepts valid CELEX-ID with defaults', () => {
    const result = citationsSchema.parse({ celex_id: '32024R1689' })
    expect(result.celex_id).toBe('32024R1689')
    expect(result.language).toBe('DEU')
    expect(result.direction).toBe('both')
    expect(result.limit).toBe(20)
  })

  it('C2 – accepts direction=cited_by', () => {
    const result = citationsSchema.parse({ celex_id: '32024R1689', direction: 'cited_by' })
    expect(result.direction).toBe('cited_by')
  })

  it('C3 – accepts direction=cites', () => {
    const result = citationsSchema.parse({ celex_id: '32024R1689', direction: 'cites' })
    expect(result.direction).toBe('cites')
  })

  it('C4 – rejects invalid CELEX-ID', () => {
    expect(() => citationsSchema.parse({ celex_id: 'bad' })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/citationsSchema.test.ts`
Expected: FAIL

- [ ] **Step 3: Add CitationsResult type**

In `src/types.ts`, append:

```typescript
export interface CitationEntry {
  celex: string
  title: string
  date: string
  type: string
  relationship: 'cites' | 'cited_by' | 'amends' | 'amended_by' | 'based_on' | 'basis_for' | 'repeals' | 'repealed_by'
  eurlex_url: string
}

export interface CitationsResult {
  celex_id: string
  citations: CitationEntry[]
  total: number
}
```

- [ ] **Step 4: Create citationsSchema.ts**

Create `src/schemas/citationsSchema.ts`:

```typescript
import { z } from 'zod'

export const citationsSchema = z.object({
  celex_id: z.string()
    .regex(/^\d[A-Z0-9]{4,20}$/)
    .describe("CELEX-Identifier, z.B. '32024R1689'"),
  language: z.enum(['DEU', 'ENG', 'FRA'])
    .default('DEU')
    .describe('Sprache für Titel'),
  direction: z.enum(['cites', 'cited_by', 'both'])
    .default('both')
    .describe('Richtung: cites=zitiert von diesem Dokument, cited_by=zitiert dieses Dokument, both=beides'),
  limit: z.number().int().min(1).max(100).default(20)
    .describe('Max. Ergebnisse'),
}).strict()

export type CitationsInput = z.infer<typeof citationsSchema>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/citationsSchema.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/schemas/citationsSchema.ts tests/citationsSchema.test.ts
git commit -m "feat(citations): add CitationsResult type and Zod schema"
```

---

### Task 8.2: CellarClient.buildCitationsQuery() + citationsQuery()

**Files:**
- Modify: `src/services/cellarClient.ts`
- Create: `tests/cellarClient.citations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/cellarClient.citations.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CellarClient } from '../src/services/cellarClient.js'

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})

describe('buildCitationsQuery()', () => {
  it('C5 – generates SPARQL for "cites" direction with work_cites_work', () => {
    const client = new CellarClient()
    const sparql = client.buildCitationsQuery('32024R1689', 'DEU', 'cites', 20)

    expect(sparql).toContain('32024R1689')
    expect(sparql).toContain('work_cites_work')
  })

  it('C6 – generates SPARQL for "cited_by" direction', () => {
    const client = new CellarClient()
    const sparql = client.buildCitationsQuery('32024R1689', 'DEU', 'cited_by', 20)

    expect(sparql).toContain('32024R1689')
    expect(sparql).toContain('work_cites_work')
  })

  it('C7 – generates UNION query for "both" direction', () => {
    const client = new CellarClient()
    const sparql = client.buildCitationsQuery('32024R1689', 'DEU', 'both', 20)

    expect(sparql).toContain('UNION')
  })

  it('C8 – includes legal basis, amends, and repeals relationships', () => {
    const client = new CellarClient()
    const sparql = client.buildCitationsQuery('32024R1689', 'DEU', 'both', 20)

    expect(sparql).toContain('resource_legal_based_on_resource_legal')
    expect(sparql).toContain('resource_legal_amends_resource_legal')
    expect(sparql).toContain('resource_legal_repeals_resource_legal')
  })
})

describe('citationsQuery()', () => {
  it('C9 – returns CitationsResult with parsed citation entries', async () => {
    const sparqlResponse = {
      results: {
        bindings: [{
          celex: { type: 'literal', value: '32016R0679' },
          title: { type: 'literal', value: 'DSGVO' },
          date: { type: 'literal', value: '2016-04-27' },
          resType: { type: 'literal', value: 'REG' },
          rel: { type: 'literal', value: 'cites' },
        }],
      },
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sparqlResponse,
    })

    const client = new CellarClient()
    const result = await client.citationsQuery('32024R1689', 'DEU', 'both', 20)

    expect(result.celex_id).toBe('32024R1689')
    expect(result.citations).toHaveLength(1)
    expect(result.citations[0].celex).toBe('32016R0679')
    expect(result.citations[0].relationship).toBe('cites')
  })

  it('C10 – returns empty citations array when no relationships found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: { bindings: [] } }),
    })

    const client = new CellarClient()
    const result = await client.citationsQuery('32024R1689', 'DEU', 'both', 20)

    expect(result.citations).toEqual([])
    expect(result.total).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/cellarClient.citations.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement buildCitationsQuery() and citationsQuery()**

In `src/services/cellarClient.ts`, add to CellarClient class:

```typescript
  buildCitationsQuery(
    celexId: string,
    language: string,
    direction: 'cites' | 'cited_by' | 'both',
    limit: number
  ): string {
    const lang = LANGUAGE_URI_MAP[language] ?? language
    const escaped = escapeSparqlString(celexId)

    const citesBlock = [
      '  {',
      `    ?sourceWork cdm:resource_legal_id_celex "${escaped}" .`,
      '    { ?sourceWork cdm:work_cites_work ?relWork . BIND("cites" AS ?rel) }',
      '    UNION',
      '    { ?sourceWork cdm:resource_legal_based_on_resource_legal ?relWork . BIND("based_on" AS ?rel) }',
      '    UNION',
      '    { ?sourceWork cdm:resource_legal_amends_resource_legal ?relWork . BIND("amends" AS ?rel) }',
    '    UNION',
    '    { ?sourceWork cdm:resource_legal_repeals_resource_legal ?relWork . BIND("repeals" AS ?rel) }',
      '  }',
    ].join('\n')

    const citedByBlock = [
      '  {',
      `    ?relWork cdm:work_cites_work ?sourceWork .`,
      `    ?sourceWork cdm:resource_legal_id_celex "${escaped}" .`,
      '    BIND("cited_by" AS ?rel)',
      '  }',
      '  UNION',
      '  {',
      `    ?relWork cdm:resource_legal_based_on_resource_legal ?sourceWork .`,
      `    ?sourceWork cdm:resource_legal_id_celex "${escaped}" .`,
      '    BIND("basis_for" AS ?rel)',
      '  }',
      '  UNION',
      '  {',
      `    ?relWork cdm:resource_legal_amends_resource_legal ?sourceWork .`,
      `    ?sourceWork cdm:resource_legal_id_celex "${escaped}" .`,
      '    BIND("amended_by" AS ?rel)',
      '  }',
      '  UNION',
      '  {',
      `    ?relWork cdm:resource_legal_repeals_resource_legal ?sourceWork .`,
      `    ?sourceWork cdm:resource_legal_id_celex "${escaped}" .`,
      '    BIND("repealed_by" AS ?rel)',
      '  }',
    ].join('\n')

    let body: string
    if (direction === 'cites') body = citesBlock
    else if (direction === 'cited_by') body = citedByBlock
    else body = `${citesBlock}\n  UNION\n${citedByBlock}`

    return [
      'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>',
      '',
      'SELECT DISTINCT ?celex ?title ?date ?resType ?rel WHERE {',
      body,
      '  ?relWork cdm:resource_legal_id_celex ?celex .',
      '  ?relWork cdm:work_has_resource-type ?resTypeUri .',
      '  BIND(REPLACE(STR(?resTypeUri), "^.*/", "") AS ?resType)',
      `  ?relExpr cdm:expression_belongs_to_work ?relWork .`,
      `  ?relExpr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/${lang}> .`,
      '  ?relExpr cdm:expression_title ?title .',
      '  OPTIONAL { ?relWork cdm:work_date_document ?date . }',
      '}',
      'ORDER BY DESC(?date)',
      `LIMIT ${limit}`,
    ].join('\n')
  }

  async citationsQuery(
    celexId: string,
    language: string,
    direction: 'cites' | 'cited_by' | 'both',
    limit: number
  ): Promise<CitationsResult> {
    const sparql = this.buildCitationsQuery(celexId, language, direction, limit)
    const httpLang = LANGUAGE_HTTP_MAP[language] ?? 'de'

    const response = await fetch(SPARQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-query',
        Accept: 'application/sparql-results+json',
      },
      body: sparql,
    })

    if (!response.ok) {
      throw new Error(`SPARQL endpoint error: ${response.status}`)
    }

    const data = await response.json()
    const citations = data.results.bindings.map((b: any) => ({
      celex: b.celex.value,
      title: b.title.value,
      date: b.date?.value ?? '',
      type: b.resType.value,
      relationship: b.rel.value,
      eurlex_url: `${EURLEX_BASE}/${httpLang.toUpperCase()}/TXT/?uri=CELEX:${b.celex.value}`,
    }))

    return {
      celex_id: celexId,
      citations,
      total: citations.length,
    }
  }
```

Add `CitationsResult, CitationEntry` to the type import.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/cellarClient.citations.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/cellarClient.ts tests/cellarClient.citations.test.ts
git commit -m "feat(citations): add buildCitationsQuery and citationsQuery to CellarClient"
```

---

### Task 8.3: eurlex_citations tool handler + registration

**Files:**
- Create: `src/tools/citations.ts`
- Create: `tests/citations.tool.test.ts`
- Modify: `src/index.ts`
- Modify: `tests/smoke.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/citations.tool.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCitationsQuery = vi.fn()
vi.mock('../src/services/cellarClient.js', () => ({
  CellarClient: vi.fn().mockImplementation(() => ({
    citationsQuery: mockCitationsQuery,
  })),
}))

import { handleEurlexCitations } from '../src/tools/citations.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleEurlexCitations()', () => {
  it('C11 – returns citations as JSON in MCP format', async () => {
    mockCitationsQuery.mockResolvedValueOnce({
      celex_id: '32024R1689',
      citations: [{ celex: '32016R0679', title: 'DSGVO', relationship: 'cites' }],
      total: 1,
    })

    const result = await handleEurlexCitations({
      celex_id: '32024R1689',
      language: 'DEU',
      direction: 'both',
      limit: 20,
    })

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.celex_id).toBe('32024R1689')
    expect(parsed.citations).toHaveLength(1)
  })

  it('C12 – returns isError on failure', async () => {
    mockCitationsQuery.mockRejectedValueOnce(new Error('SPARQL timeout'))

    const result = await handleEurlexCitations({
      celex_id: '32024R1689',
      language: 'DEU',
      direction: 'both',
      limit: 20,
    })

    expect(result.isError).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/citations.tool.test.ts`
Expected: FAIL

- [ ] **Step 3: Create citations tool handler**

Create `src/tools/citations.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CellarClient } from '../services/cellarClient.js'
import { citationsSchema } from '../schemas/citationsSchema.js'

export async function handleEurlexCitations(input: {
  celex_id: string
  language: string
  direction: string
  limit: number
}) {
  try {
    const parsed = citationsSchema.parse(input)
    const client = new CellarClient()
    const result = await client.citationsQuery(
      parsed.celex_id,
      parsed.language,
      parsed.direction,
      parsed.limit
    )

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result),
      }],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
      isError: true,
    }
  }
}

export function registerCitationsTool(server: McpServer) {
  server.tool(
    'eurlex_citations',
    'Findet Zitierungen, Rechtsgrundlagen und Änderungen eines EU-Rechtsakts',
    citationsSchema.shape,
    { readOnlyHint: true, destructiveHint: false },
    async (params) => handleEurlexCitations(params)
  )
}
```

- [ ] **Step 4: Register in index.ts**

```typescript
import { registerCitationsTool } from './tools/citations.js'
// In createServer():
registerCitationsTool(server)
```

- [ ] **Step 5: Update smoke test**

```typescript
expect(toolNames).toEqual(['eurlex_citations', 'eurlex_fetch', 'eurlex_metadata', 'eurlex_search'])
```

- [ ] **Step 6: Run full test suite**

Run: `pnpm vitest run`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/tools/citations.ts src/index.ts tests/citations.tool.test.ts tests/smoke.test.ts
git commit -m "feat(citations): add eurlex_citations tool with handler and registration"
```

**Definition of Done Phase 8:**
- [ ] `citationsSchema` validates CELEX-ID, direction, limit
- [ ] `CellarClient.buildCitationsQuery()` generates SPARQL with UNION for both directions
- [ ] `CellarClient.citationsQuery()` returns `CitationsResult`
- [ ] `handleEurlexCitations()` returns MCP-formatted response
- [ ] Tool registered as `eurlex_citations` in server
- [ ] Smoke test updated with new tool count
- [ ] 12+ new unit tests, all green
- [ ] All existing tests still pass

---

## Chunk 3: Phase 9 — eurlex_by_eurovoc Tool

### Task 9.1: EuroVocSearchResult type + Zod schema

**Files:**
- Modify: `src/types.ts`
- Create: `src/schemas/eurovocSchema.ts`
- Create: `tests/eurovocSchema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/eurovocSchema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { eurovocSchema } from '../src/schemas/eurovocSchema.js'

describe('eurovocSchema', () => {
  it('E1 – accepts concept label with defaults', () => {
    const result = eurovocSchema.parse({ concept: 'artificial intelligence' })
    expect(result.concept).toBe('artificial intelligence')
    expect(result.resource_type).toBe('any')
    expect(result.language).toBe('DEU')
    expect(result.limit).toBe(10)
  })

  it('E2 – accepts concept as EuroVoc URI', () => {
    const result = eurovocSchema.parse({ concept: 'http://eurovoc.europa.eu/4424' })
    expect(result.concept).toBe('http://eurovoc.europa.eu/4424')
  })

  it('E3 – requires concept min 2 chars', () => {
    expect(() => eurovocSchema.parse({ concept: 'a' })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/eurovocSchema.test.ts`
Expected: FAIL

- [ ] **Step 3: Add type to types.ts — reuse SearchResult (same shape)**

No new type needed — EuroVoc search returns the same `SearchResult[]` as the existing search.

- [ ] **Step 4: Create eurovocSchema.ts**

Create `src/schemas/eurovocSchema.ts`:

```typescript
import { z } from 'zod'

export const eurovocSchema = z.object({
  concept: z.string().min(2).max(500)
    .describe("EuroVoc-Konzept: Label (z.B. 'artificial intelligence') oder URI (z.B. 'http://eurovoc.europa.eu/4424')"),
  resource_type: z.enum(['REG', 'DIR', 'DEC', 'JUDG', 'any'])
    .default('any')
    .describe('Dokumenttyp-Filter'),
  language: z.enum(['DEU', 'ENG', 'FRA'])
    .default('DEU')
    .describe('Sprache für Titel und EuroVoc-Labels'),
  limit: z.number().int().min(1).max(50).default(10)
    .describe('Max. Ergebnisse'),
}).strict()

export type EurovocInput = z.infer<typeof eurovocSchema>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/eurovocSchema.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/schemas/eurovocSchema.ts tests/eurovocSchema.test.ts
git commit -m "feat(eurovoc): add eurovocSchema for EuroVoc search"
```

---

### Task 9.2: CellarClient.buildEurovocQuery() + eurovocQuery()

**Files:**
- Modify: `src/services/cellarClient.ts`
- Create: `tests/cellarClient.eurovoc.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/cellarClient.eurovoc.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CellarClient } from '../src/services/cellarClient.js'

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})

describe('buildEurovocQuery()', () => {
  it('E4 – resolves label to EuroVoc concept via skos:prefLabel', () => {
    const client = new CellarClient()
    const sparql = client.buildEurovocQuery('artificial intelligence', 'any', 'ENG', 10)

    expect(sparql).toContain('skos:prefLabel')
    expect(sparql).toContain('artificial intelligence')
    expect(sparql).toContain('work_is_about_concept_eurovoc')
  })

  it('E5 – uses URI directly when concept starts with http', () => {
    const client = new CellarClient()
    const sparql = client.buildEurovocQuery('http://eurovoc.europa.eu/4424', 'any', 'ENG', 10)

    expect(sparql).toContain('http://eurovoc.europa.eu/4424')
    expect(sparql).not.toContain('skos:prefLabel')
  })

  it('E6 – applies resource_type filter when not any', () => {
    const client = new CellarClient()
    const sparql = client.buildEurovocQuery('data protection', 'REG', 'DEU', 10)

    expect(sparql).toContain('resource-type/REG')
  })
})

describe('eurovocQuery()', () => {
  it('E7 – returns SearchResult array from SPARQL response', async () => {
    const response = {
      results: {
        bindings: [{
          work: { type: 'uri', value: 'http://publications.europa.eu/resource/cellar/uuid1' },
          celex: { type: 'literal', value: '32024R1689' },
          title: { type: 'literal', value: 'AI Act' },
          date: { type: 'literal', value: '2024-06-13' },
          resType: { type: 'literal', value: 'REG' },
        }],
      },
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => response,
    })

    const client = new CellarClient()
    const results = await client.eurovocQuery('artificial intelligence', 'any', 'ENG', 10)

    expect(results).toHaveLength(1)
    expect(results[0].celex).toBe('32024R1689')
  })

  it('E8 – returns empty array when no results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: { bindings: [] } }),
    })

    const client = new CellarClient()
    const results = await client.eurovocQuery('xyznonexistent', 'any', 'DEU', 10)
    expect(results).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/cellarClient.eurovoc.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement buildEurovocQuery() and eurovocQuery()**

Add to CellarClient class in `src/services/cellarClient.ts`:

```typescript
  buildEurovocQuery(
    concept: string,
    resourceType: string,
    language: string,
    limit: number
  ): string {
    const lang = LANGUAGE_URI_MAP[language] ?? language
    const isUri = concept.startsWith('http')

    const conceptFilter = isUri
      ? `  ?work cdm:work_is_about_concept_eurovoc <${concept}> .`
      : [
        `  ?work cdm:work_is_about_concept_eurovoc ?evConcept .`,
        `  ?evConcept skos:prefLabel ?evLabel .`,
        `  FILTER(CONTAINS(LCASE(STR(?evLabel)), LCASE("${escapeSparqlString(concept)}")))`,
      ].join('\n')

    const typeFilter = resourceType !== 'any'
      ? `  ?work cdm:work_has_resource-type <http://publications.europa.eu/resource/authority/resource-type/${resourceType}> .`
      : ''

    return [
      'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>',
      'PREFIX skos: <http://www.w3.org/2004/02/skos/core#>',
      'PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>',
      '',
      'SELECT DISTINCT ?work ?celex ?title ?date ?resType WHERE {',
      conceptFilter,
      typeFilter,
      '  ?work cdm:resource_legal_id_celex ?celex .',
      '  ?work cdm:work_has_resource-type ?resTypeUri .',
      '  BIND(REPLACE(STR(?resTypeUri), "^.*/", "") AS ?resType)',
      `  ?expr cdm:expression_belongs_to_work ?work .`,
      `  ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/${lang}> .`,
      '  ?expr cdm:expression_title ?title .',
      '  OPTIONAL { ?work cdm:work_date_document ?date . }',
      `  FILTER NOT EXISTS { ?work cdm:do_not_index "true"^^xsd:boolean }`,
      '}',
      'ORDER BY DESC(?date)',
      `LIMIT ${limit}`,
    ].join('\n')
  }

  async eurovocQuery(
    concept: string,
    resourceType: string,
    language: string,
    limit: number
  ): Promise<SearchResult[]> {
    const sparql = this.buildEurovocQuery(concept, resourceType, language, limit)
    const httpLang = LANGUAGE_HTTP_MAP[language] ?? 'de'

    const response = await fetch(SPARQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-query',
        Accept: 'application/sparql-results+json',
      },
      body: sparql,
    })

    if (!response.ok) {
      throw new Error(`SPARQL endpoint error: ${response.status}`)
    }

    const data = await response.json()
    return data.results.bindings.map((b: any) => ({
      celex: b.celex.value,
      title: b.title.value,
      date: b.date?.value ?? '',
      type: b.resType.value,
      eurlex_url: `${EURLEX_BASE}/${httpLang.toUpperCase()}/TXT/?uri=CELEX:${b.celex.value}`,
    }))
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/cellarClient.eurovoc.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/cellarClient.ts tests/cellarClient.eurovoc.test.ts
git commit -m "feat(eurovoc): add buildEurovocQuery and eurovocQuery to CellarClient"
```

---

### Task 9.3: eurlex_by_eurovoc tool handler + registration

**Files:**
- Create: `src/tools/eurovoc.ts`
- Create: `tests/eurovoc.tool.test.ts`
- Modify: `src/index.ts`
- Modify: `tests/smoke.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/eurovoc.tool.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEurovocQuery = vi.fn()
vi.mock('../src/services/cellarClient.js', () => ({
  CellarClient: vi.fn().mockImplementation(() => ({
    eurovocQuery: mockEurovocQuery,
  })),
}))

import { handleEurlexByEurovoc } from '../src/tools/eurovoc.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleEurlexByEurovoc()', () => {
  it('E9 – returns search results as JSON', async () => {
    mockEurovocQuery.mockResolvedValueOnce([
      { celex: '32024R1689', title: 'AI Act', date: '2024-06-13', type: 'REG', eurlex_url: 'https://...' },
    ])

    const result = await handleEurlexByEurovoc({
      concept: 'artificial intelligence',
      resource_type: 'any',
      language: 'ENG',
      limit: 10,
    })

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.results).toHaveLength(1)
    expect(parsed.total).toBe(1)
  })

  it('E10 – returns no-results message when empty', async () => {
    mockEurovocQuery.mockResolvedValueOnce([])

    const result = await handleEurlexByEurovoc({
      concept: 'xyznonexistent',
      resource_type: 'any',
      language: 'DEU',
      limit: 10,
    })

    expect(result.content[0].text).toContain('Keine Ergebnisse')
  })

  it('E11 – returns isError on failure', async () => {
    mockEurovocQuery.mockRejectedValueOnce(new Error('timeout'))

    const result = await handleEurlexByEurovoc({
      concept: 'test',
      resource_type: 'any',
      language: 'DEU',
      limit: 10,
    })

    expect(result.isError).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/eurovoc.tool.test.ts`
Expected: FAIL

- [ ] **Step 3: Create eurovoc tool handler**

Create `src/tools/eurovoc.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CellarClient } from '../services/cellarClient.js'
import { eurovocSchema } from '../schemas/eurovocSchema.js'

export async function handleEurlexByEurovoc(input: {
  concept: string
  resource_type: string
  language: string
  limit: number
}) {
  try {
    const parsed = eurovocSchema.parse(input)
    const client = new CellarClient()
    const results = await client.eurovocQuery(
      parsed.concept,
      parsed.resource_type,
      parsed.language,
      parsed.limit
    )

    if (results.length === 0) {
      return {
        content: [{ type: 'text' as const, text: `Keine Ergebnisse für EuroVoc-Konzept "${parsed.concept}"` }],
      }
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ results, total: results.length }),
      }],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
      isError: true,
    }
  }
}

export function registerEurovocTool(server: McpServer) {
  server.tool(
    'eurlex_by_eurovoc',
    'Sucht EU-Rechtsakte nach EuroVoc-Thema (z.B. "artificial intelligence", "data protection")',
    eurovocSchema.shape,
    { readOnlyHint: true, destructiveHint: false },
    async (params) => handleEurlexByEurovoc(params)
  )
}
```

- [ ] **Step 4: Register in index.ts + update smoke test**

In `src/index.ts`:
```typescript
import { registerEurovocTool } from './tools/eurovoc.js'
// In createServer():
registerEurovocTool(server)
```

In `tests/smoke.test.ts`:
```typescript
expect(toolNames).toEqual(['eurlex_by_eurovoc', 'eurlex_citations', 'eurlex_fetch', 'eurlex_metadata', 'eurlex_search'])
```

- [ ] **Step 5: Run full test suite**

Run: `pnpm vitest run`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/tools/eurovoc.ts src/index.ts tests/eurovoc.tool.test.ts tests/smoke.test.ts
git commit -m "feat(eurovoc): add eurlex_by_eurovoc tool with handler and registration"
```

**Definition of Done Phase 9:**
- [ ] `eurovocSchema` validates concept (label or URI), resource_type, language, limit
- [ ] `CellarClient.buildEurovocQuery()` handles both label lookup and direct URI
- [ ] `CellarClient.eurovocQuery()` returns `SearchResult[]`
- [ ] Tool registered as `eurlex_by_eurovoc`
- [ ] Smoke test updated
- [ ] 11+ new unit tests, all green

---

## Chunk 4: Phase 10 — eurlex_consolidated Tool

> **Plan Review 2026-03-11:** Optimierungen nach Issue-Analyse angewandt:
> 1. `LANGUAGE_ELI_MAP` Konstante statt Inline-Ternaries
> 2. `ConsolidatedResult` Interface in `src/types.ts`
> 3. Spezifische 404-Fehlermeldung mit Hinweis auf `eurlex_fetch`
> 4. `redirect: 'follow'` explizit dokumentiert
> 5. `Accept: text/html` Header (unterscheidet sich von fetchDocument)
> 6. Smoke-Test mit vollständiger alphabetischer Tool-Liste

### Task 10.1: Zod schema + ConsolidatedResult type + CellarClient.fetchConsolidated()

**Files:**
- Modify: `src/types.ts` — Add ConsolidatedResult interface
- Modify: `src/services/cellarClient.ts` — Add LANGUAGE_ELI_MAP + fetchConsolidated()
- Create: `src/schemas/consolidatedSchema.ts`
- Create: `tests/consolidatedSchema.test.ts`
- Create: `tests/cellarClient.consolidated.test.ts`

- [ ] **Step 1: Write the failing test for schema**

Create `tests/consolidatedSchema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { consolidatedSchema } from '../src/schemas/consolidatedSchema.js'

describe('consolidatedSchema', () => {
  it('CO1 – accepts type/year/number with defaults', () => {
    const result = consolidatedSchema.parse({ doc_type: 'reg', year: 2024, number: 1689 })
    expect(result.language).toBe('DEU')
    expect(result.format).toBe('xhtml')
  })

  it('CO2 – accepts dir type', () => {
    const result = consolidatedSchema.parse({ doc_type: 'dir', year: 2022, number: 2555 })
    expect(result.doc_type).toBe('dir')
  })

  it('CO3 – rejects year below 1950', () => {
    expect(() => consolidatedSchema.parse({ doc_type: 'reg', year: 1900, number: 1 })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/consolidatedSchema.test.ts`
Expected: FAIL

- [ ] **Step 3: Add ConsolidatedResult type to src/types.ts**

In `src/types.ts`, append:

```typescript
export interface ConsolidatedResult {
  doc_type: string
  year: number
  number: number
  language: string
  content: string
  truncated: boolean
  char_count: number
  eli_url: string
}
```

- [ ] **Step 4: Create consolidatedSchema**

Create `src/schemas/consolidatedSchema.ts`:

```typescript
import { z } from 'zod'

export const consolidatedSchema = z.object({
  doc_type: z.enum(['reg', 'dir', 'dec'])
    .describe("Dokumenttyp: reg=Verordnung, dir=Richtlinie, dec=Entscheidung"),
  year: z.number().int().min(1950).max(2100)
    .describe("Jahr des Rechtsakts, z.B. 2024"),
  number: z.number().int().min(1)
    .describe("Dokumentnummer, z.B. 1689"),
  language: z.enum(['DEU', 'ENG', 'FRA'])
    .default('DEU')
    .describe('Sprache'),
  format: z.enum(['xhtml', 'plain'])
    .default('xhtml')
    .describe('Ausgabeformat'),
  max_chars: z.number().int().min(1000).max(50000).default(20000)
    .describe('Maximale Zeichenanzahl'),
}).strict()

export type ConsolidatedInput = z.infer<typeof consolidatedSchema>
```

- [ ] **Step 5: Run schema test**

Run: `pnpm vitest run tests/consolidatedSchema.test.ts`
Expected: PASS

- [ ] **Step 6: Add LANGUAGE_ELI_MAP to CellarClient**

In `src/services/cellarClient.ts`, add after `LANGUAGE_HTTP_MAP`:

```typescript
/** Maps 3-letter language codes to ELI URL language codes (ISO 639-3) */
const LANGUAGE_ELI_MAP: Record<string, string> = {
  DEU: 'deu',
  ENG: 'eng',
  FRA: 'fra',
};
```

- [ ] **Step 7: Write the failing test for fetchConsolidated**

Create `tests/cellarClient.consolidated.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CellarClient } from '../src/services/cellarClient.js'

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})

describe('fetchConsolidated()', () => {
  it('CO4 – constructs ELI URL with correct doc_type/year/number', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      redirected: true,
      url: 'https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:02024R1689-20240801',
      text: async () => '<html><body>Consolidated text</body></html>',
    })

    const client = new CellarClient()
    await client.fetchConsolidated('reg', 2024, 1689, 'DEU')

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('data.europa.eu/eli/reg/2024/1689')
  })

  it('CO5 – returns HTML content string', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body>Artikel 1</body></html>',
    })

    const client = new CellarClient()
    const result = await client.fetchConsolidated('dir', 2022, 2555, 'DEU')

    expect(result).toContain('Artikel 1')
  })

  it('CO6 – throws specific message on 404 with eurlex_fetch hint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    })

    const client = new CellarClient()
    await expect(client.fetchConsolidated('reg', 9999, 9999, 'DEU'))
      .rejects.toThrow(/eurlex_fetch/)
  })
})
```

- [ ] **Step 8: Run test to verify it fails**

Run: `pnpm vitest run tests/cellarClient.consolidated.test.ts`
Expected: FAIL

- [ ] **Step 9: Implement fetchConsolidated()**

Add to CellarClient class:

```typescript
  async fetchConsolidated(
    docType: string,
    year: number,
    number: number,
    language: string
  ): Promise<string> {
    const eliLang = LANGUAGE_ELI_MAP[language] ?? 'deu'
    const eliUrl = `http://data.europa.eu/eli/${docType}/${year}/${number}/oj/${eliLang}/xhtml`

    const response = await fetch(eliUrl, {
      method: 'GET',
      headers: { Accept: 'text/html' },
      redirect: 'follow',  // ELI URLs redirect to EUR-Lex
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          `Keine konsolidierte Fassung für ${docType}/${year}/${number} verfügbar. ` +
          `Verwenden Sie eurlex_fetch mit der CELEX-ID für die Original-OJ-Version.`
        )
      }
      throw new Error(`Consolidated document error: ${docType}/${year}/${number} (HTTP ${response.status})`)
    }

    return response.text()
  }
```

- [ ] **Step 10: Run test to verify it passes**

Run: `pnpm vitest run tests/cellarClient.consolidated.test.ts`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/schemas/consolidatedSchema.ts src/services/cellarClient.ts tests/consolidatedSchema.test.ts tests/cellarClient.consolidated.test.ts
git commit -m "feat(consolidated): add consolidatedSchema and fetchConsolidated to CellarClient"
```

---

### Task 10.2: eurlex_consolidated tool handler + registration

**Files:**
- Create: `src/tools/consolidated.ts`
- Create: `tests/consolidated.tool.test.ts`
- Modify: `src/index.ts`
- Modify: `tests/smoke.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/consolidated.tool.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetchConsolidated = vi.fn()
vi.mock('../src/services/cellarClient.js', () => ({
  CellarClient: vi.fn().mockImplementation(() => ({
    fetchConsolidated: mockFetchConsolidated,
  })),
}))

import { handleEurlexConsolidated } from '../src/tools/consolidated.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleEurlexConsolidated()', () => {
  it('CO7 – returns document content with truncation info', async () => {
    mockFetchConsolidated.mockResolvedValueOnce('<html><body>Content</body></html>')

    const result = await handleEurlexConsolidated({
      doc_type: 'reg',
      year: 2024,
      number: 1689,
      language: 'DEU',
      format: 'xhtml',
      max_chars: 20000,
    })

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.content).toContain('Content')
    expect(parsed.truncated).toBe(false)
    expect(parsed.eli_url).toContain('data.europa.eu/eli/reg/2024/1689')
  })

  it('CO8 – strips HTML in plain format', async () => {
    mockFetchConsolidated.mockResolvedValueOnce('<html><body><p>Text</p></body></html>')

    const result = await handleEurlexConsolidated({
      doc_type: 'reg',
      year: 2024,
      number: 1689,
      language: 'DEU',
      format: 'plain',
      max_chars: 20000,
    })

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.content).not.toContain('<')
    expect(parsed.content).toContain('Text')
  })

  it('CO9 – truncates at max_chars', async () => {
    mockFetchConsolidated.mockResolvedValueOnce('x'.repeat(30000))

    const result = await handleEurlexConsolidated({
      doc_type: 'reg',
      year: 2024,
      number: 1689,
      language: 'DEU',
      format: 'xhtml',
      max_chars: 5000,
    })

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.truncated).toBe(true)
    expect(parsed.char_count).toBeLessThanOrEqual(5000)
  })

  it('CO10 – returns isError on failure', async () => {
    mockFetchConsolidated.mockRejectedValueOnce(new Error('Not found'))

    const result = await handleEurlexConsolidated({
      doc_type: 'reg',
      year: 9999,
      number: 9999,
      language: 'DEU',
      format: 'xhtml',
      max_chars: 20000,
    })

    expect(result.isError).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/consolidated.tool.test.ts`
Expected: FAIL

- [ ] **Step 3: Create consolidated tool handler**

Create `src/tools/consolidated.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CellarClient } from '../services/cellarClient.js'
import { consolidatedSchema } from '../schemas/consolidatedSchema.js'
import type { ConsolidatedResult } from '../types.js'

export async function handleEurlexConsolidated(input: {
  doc_type: string
  year: number
  number: number
  language: string
  format: string
  max_chars: number
}) {
  try {
    const parsed = consolidatedSchema.parse(input)
    const client = new CellarClient()
    let content = await client.fetchConsolidated(
      parsed.doc_type,
      parsed.year,
      parsed.number,
      parsed.language
    )

    if (parsed.format === 'plain') {
      content = content.replace(/<[^>]*>/g, '')
    }

    const truncated = content.length > parsed.max_chars
    if (truncated) {
      content = content.slice(0, parsed.max_chars)
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          doc_type: parsed.doc_type,
          year: parsed.year,
          number: parsed.number,
          language: parsed.language,
          content,
          truncated,
          char_count: content.length,
          eli_url: `http://data.europa.eu/eli/${parsed.doc_type}/${parsed.year}/${parsed.number}`,
        }),
      }],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
      isError: true,
    }
  }
}

export function registerConsolidatedTool(server: McpServer) {
  server.tool(
    'eurlex_consolidated',
    'Ruft die konsolidierte (aktuell gültige) Fassung eines EU-Rechtsakts ab via ELI',
    consolidatedSchema.shape,
    { readOnlyHint: true, destructiveHint: false },
    async (params) => handleEurlexConsolidated(params)
  )
}
```

- [ ] **Step 4: Register in index.ts + update smoke test**

In `src/index.ts`:
```typescript
import { registerConsolidatedTool } from './tools/consolidated.js'
// In createServer():
registerConsolidatedTool(server)
```

In `tests/smoke.test.ts`:
```typescript
expect(toolNames).toEqual([
  'eurlex_by_eurovoc', 'eurlex_citations', 'eurlex_consolidated',
  'eurlex_fetch', 'eurlex_metadata', 'eurlex_search'
])
```

- [ ] **Step 5: Run full test suite**

Run: `pnpm vitest run`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/tools/consolidated.ts src/index.ts tests/consolidated.tool.test.ts tests/smoke.test.ts
git commit -m "feat(consolidated): add eurlex_consolidated tool with ELI-based retrieval"
```

**Definition of Done Phase 10:**
- [ ] `ConsolidatedResult` interface in `src/types.ts`
- [ ] `LANGUAGE_ELI_MAP` constant in `cellarClient.ts` (no inline ternaries)
- [ ] `consolidatedSchema` validates doc_type, year (1950-2100), number, language, format, max_chars
- [ ] `CellarClient.fetchConsolidated()` fetches via ELI URL with `redirect: 'follow'` + `Accept: text/html`
- [ ] Spezifische 404-Fehlermeldung mit Hinweis auf `eurlex_fetch`
- [ ] Tool handler applies format conversion + truncation (same pattern as eurlex_fetch)
- [ ] Tool registered as `eurlex_consolidated`
- [ ] Smoke test updated (6 Tools, alphabetisch: `eurlex_by_eurovoc, eurlex_citations, eurlex_consolidated, eurlex_fetch, eurlex_metadata, eurlex_search`)
- [ ] 7+ new unit tests, all green

---

## Chunk 5: Phase 11 — Enhanced Search + Guide Update

### Task 11.1: Expand resource_type enum in searchSchema

**Files:**
- Modify: `src/schemas/searchSchema.ts`
- Create: `tests/cellarClient.enhanced-search.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/cellarClient.enhanced-search.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { searchSchema } from '../src/schemas/searchSchema.js'
import { CellarClient } from '../src/services/cellarClient.js'

describe('enhanced searchSchema', () => {
  it('ES1 – accepts REG_IMPL resource type', () => {
    const result = searchSchema.parse({ query: 'test query', resource_type: 'REG_IMPL' })
    expect(result.resource_type).toBe('REG_IMPL')
  })

  it('ES2 – accepts REG_DEL resource type', () => {
    const result = searchSchema.parse({ query: 'test query', resource_type: 'REG_DEL' })
    expect(result.resource_type).toBe('REG_DEL')
  })

  it('ES3 – accepts DIR_IMPL resource type', () => {
    const result = searchSchema.parse({ query: 'test query', resource_type: 'DIR_IMPL' })
    expect(result.resource_type).toBe('DIR_IMPL')
  })

  it('ES4 – accepts RECO resource type', () => {
    const result = searchSchema.parse({ query: 'test query', resource_type: 'RECO' })
    expect(result.resource_type).toBe('RECO')
  })
})

describe('enhanced buildSparqlQuery()', () => {
  it('ES5 – generates correct filter for REG_IMPL', () => {
    const client = new CellarClient()
    const sparql = client.buildSparqlQuery({
      query: 'test', resource_type: 'REG_IMPL', language: 'DEU', limit: 10,
    })
    expect(sparql).toContain('resource-type/REG_IMPL')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/cellarClient.enhanced-search.test.ts`
Expected: FAIL — Zod rejects REG_IMPL

- [ ] **Step 3: Expand searchSchema enum**

In `src/schemas/searchSchema.ts`, update the resource_type enum:

```typescript
  resource_type: z.enum([
    "REG", "REG_IMPL", "REG_DEL",
    "DIR", "DIR_IMPL", "DIR_DEL",
    "DEC", "DEC_IMPL", "DEC_DEL",
    "JUDG", "ORDER", "OPIN_AG",
    "RECO",
    "any"
  ])
    .default("any")
    .describe("Dokumenttyp: REG=Verordnung, DIR=Richtlinie, DEC=Entscheidung, JUDG=Urteil, REG_IMPL=Durchführungsverordnung, REG_DEL=Delegierte Verordnung, RECO=Empfehlung, ORDER=Gerichtsbeschluss, OPIN_AG=Schlussanträge des Generalanwalts"),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/cellarClient.enhanced-search.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite to check no regressions**

Run: `pnpm vitest run`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/schemas/searchSchema.ts tests/cellarClient.enhanced-search.test.ts
git commit -m "feat(search): expand resource_type to include delegated, implementing acts, recommendations"
```

---

### Task 11.2: Update eurlex_guide prompt with new tools

**Files:**
- Modify: `src/prompts/guide.ts`

- [ ] **Step 1: Update guide text**

In `src/prompts/guide.ts`, update `GUIDE_TEXT` to include all new tools:

```typescript
const GUIDE_TEXT = `# EUR-Lex Recherche-Guide

## Verfügbare Tools

### eurlex_search — Titelsuche
Sucht EU-Rechtsakte nach Titel. Unterstützt Filter nach Typ, Datum, Sprache.

### eurlex_fetch — Volltext abrufen
Ruft den Volltext eines Rechtsakts per CELEX-ID ab.

### eurlex_metadata — Metadaten abfragen
Liefert Inkrafttreten, Gültigkeit, In-Kraft-Status, Autoren, EuroVoc-Themen, Directory-Codes.

### eurlex_citations — Zitierungen & Beziehungen
Findet Zitierungen, Rechtsgrundlagen, Änderungen zu einem Rechtsakt.
Richtungen: cites (zitiert von), cited_by (zitiert durch), both.

### eurlex_by_eurovoc — Thematische Suche
Sucht Rechtsakte nach EuroVoc-Konzept. Findet auch Dokumente, die das Stichwort nicht im Titel haben.
Akzeptiert Labels ("artificial intelligence") oder URIs ("http://eurovoc.europa.eu/4424").

### eurlex_consolidated — Konsolidierte Fassung
Ruft die aktuell gültige Fassung ab (mit allen Änderungen eingearbeitet) via ELI.

## CELEX-Nummern-Schema
- 3 = Sekundärrecht EU (Verordnungen, Richtlinien, Entscheidungen)
- Danach: Jahr (4-stellig) + Typ-Buchstabe + Dokumentnummer
- Beispiele: 32024R1689 (AI Act), 32016R0679 (DSGVO), 32022L2555 (NIS2)

## Typ-Buchstaben → resource_type Mapping
| CELEX-Buchstabe | resource_type | Bedeutung |
|---|---|---|
| R | REG | Verordnung (direkt anwendbar) |
| L | DIR | Richtlinie (muss umgesetzt werden) |
| D | DEC | Entscheidung/Beschluss |

## Erweiterte Typen
REG_IMPL (Durchführungsverordnung), REG_DEL (Delegierte Verordnung),
DIR_IMPL (Durchführungsrichtlinie), RECO (Empfehlung),
JUDG (Urteil), ORDER (Beschluss), OPIN_AG (Schlussanträge GA)

## Suchstrategie
1. eurlex_search sucht NUR in Titeln → für thematische Suche eurlex_by_eurovoc verwenden
2. Suchbegriffe in der Sprache des Titels verwenden
3. Bei Nicht-Treffern: Synonyme probieren ("KI" vs "künstliche Intelligenz")
4. Bekannte CELEX-ID? → Direkt eurlex_fetch oder eurlex_metadata nutzen
5. Rechtsbeziehungen? → eurlex_citations für Zitierungsketten
6. Konsolidierte Fassung? → eurlex_consolidated für geltendes Recht

## Bekannte CELEX-IDs wichtiger Rechtsakte
- AI Act: 32024R1689
- DSGVO: 32016R0679
- NIS2-Richtlinie: 32022L2555
- Digital Services Act: 32022R2065
- Digital Markets Act: 32022R1925
- Data Act: 32023R2854
- Data Governance Act: 32022R0868

## Limitations
- Sehr lange Dokumente werden bei max_chars abgeschnitten
- SPARQL-Antwortzeit: 2-10 Sekunden
- Nicht alle Dokumente haben eine XHTML-Version
- EuroVoc-Labels sind sprachabhängig — englische Begriffe bei language=ENG
- Konsolidierte Fassungen existieren nicht für alle Rechtsakte`;
```

- [ ] **Step 2: Run full test suite**

Run: `pnpm vitest run`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/prompts/guide.ts
git commit -m "docs(guide): update eurlex_guide prompt with all new tools and strategies"
```

**Definition of Done Phase 11:**
- [ ] `searchSchema` accepts 13 resource types + "any"
- [ ] Guide prompt documents all 6 tools with strategies
- [ ] All existing tests still pass
- [ ] 5+ new tests for enhanced search

---

## Chunk 6: Phase 12 — Final Validation & Integration Tests

### Task 12.1: Comprehensive smoke tests for all tools

**Files:**
- Modify: `tests/smoke.test.ts`

- [ ] **Step 1: Add annotation tests for all new tools**

Append to `tests/smoke.test.ts`:

```typescript
it('V-NEW-1 – eurlex_metadata has readOnlyHint=true', async () => {
  const pair = await createTestPair()
  pairs.push(pair)
  const { tools } = await pair.client.listTools()
  const meta = tools.find((t) => t.name === 'eurlex_metadata')
  expect(meta?.annotations?.readOnlyHint).toBe(true)
  expect(meta?.annotations?.destructiveHint).toBe(false)
})

it('V-NEW-2 – eurlex_citations has readOnlyHint=true', async () => {
  const pair = await createTestPair()
  pairs.push(pair)
  const { tools } = await pair.client.listTools()
  const cit = tools.find((t) => t.name === 'eurlex_citations')
  expect(cit?.annotations?.readOnlyHint).toBe(true)
})

it('V-NEW-3 – eurlex_by_eurovoc has readOnlyHint=true', async () => {
  const pair = await createTestPair()
  pairs.push(pair)
  const { tools } = await pair.client.listTools()
  const ev = tools.find((t) => t.name === 'eurlex_by_eurovoc')
  expect(ev?.annotations?.readOnlyHint).toBe(true)
})

it('V-NEW-4 – eurlex_consolidated has readOnlyHint=true', async () => {
  const pair = await createTestPair()
  pairs.push(pair)
  const { tools } = await pair.client.listTools()
  const con = tools.find((t) => t.name === 'eurlex_consolidated')
  expect(con?.annotations?.readOnlyHint).toBe(true)
})

it('V-NEW-5 – server exposes exactly 6 tools', async () => {
  const pair = await createTestPair()
  pairs.push(pair)
  const { tools } = await pair.client.listTools()
  expect(tools).toHaveLength(6)
})
```

- [ ] **Step 2: Run smoke tests**

Run: `pnpm vitest run tests/smoke.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add tests/smoke.test.ts
git commit -m "test: add comprehensive smoke tests for all 6 tools with annotations"
```

---

### Task 12.2: Live integration tests for new tools

**Files:**
- Modify: `tests/integration/live.test.ts`

- [ ] **Step 1: Add integration tests for citations and eurovoc**

Append to `tests/integration/live.test.ts`:

```typescript
describe('citationsQuery()', () => {
  it('C-LIVE-1: finds citations for DSGVO (32016R0679)', async () => {
    const result = await client.citationsQuery('32016R0679', 'DEU', 'cited_by', 5)

    expect(result.celex_id).toBe('32016R0679')
    expect(result.citations.length).toBeGreaterThan(0)
    expect(result.citations[0]).toHaveProperty('celex')
    expect(result.citations[0]).toHaveProperty('relationship')
  }, TIMEOUT)
})

describe('eurovocQuery()', () => {
  it('E-LIVE-1: finds documents for "artificial intelligence" in ENG', async () => {
    const results = await client.eurovocQuery('artificial intelligence', 'any', 'ENG', 5)

    expect(results.length).toBeGreaterThan(0)
    const celexIds = results.map(r => r.celex)
    expect(celexIds).toContain('32024R1689') // AI Act
  }, TIMEOUT)
})
```

- [ ] **Step 2: Run integration tests**

Run: `pnpm vitest run tests/integration/live.test.ts`
Expected: PASS (60s+ timeout)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/live.test.ts
git commit -m "test: add live integration tests for citations and eurovoc queries"
```

---

### Task 12.3: Full regression + build check

- [ ] **Step 1: Run full test suite**

Run: `pnpm vitest run`
Expected: ALL PASS — should have 50+ tests total

- [ ] **Step 2: Run TypeScript build**

Run: `pnpm build`
Expected: Clean build, no errors

- [ ] **Step 3: Verify tool count**

Run: `pnpm vitest run tests/smoke.test.ts`
Expected: 6 tools registered, all with proper annotations

**Definition of Done Phase 12:**
- [ ] All 6 tools registered with correct annotations
- [ ] Live integration tests pass for metadata, citations, eurovoc
- [ ] TypeScript build succeeds
- [ ] 50+ total tests, all green
- [ ] No regressions in existing tests

---

## Summary

| Phase | Tool | New Tests | Cumulative Tools |
|-------|------|-----------|-----------------|
| 7 | `eurlex_metadata` | ~12 | 3 |
| 8 | `eurlex_citations` | ~12 | 4 |
| 9 | `eurlex_by_eurovoc` | ~11 | 5 |
| 10 | `eurlex_consolidated` | ~10 | 6 |
| 11 | Enhanced search + guide | ~5 | 6 (enhanced) |
| 12 | Validation + integration | ~7 | 6 (validated) |
| **Total** | | **~57 new tests** | **6 tools** |
