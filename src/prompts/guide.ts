import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const GUIDE_TEXT = `# EUR-Lex Recherche-Guide

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
- Nicht alle Dokumente haben eine XHTML-Version`;

export function registerGuidePrompt(server: McpServer): void {
  server.prompt("eurlex_guide", {}, () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: GUIDE_TEXT,
        },
      },
    ],
  }));
}
