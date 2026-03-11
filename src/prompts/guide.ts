import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
DIR_IMPL (Durchführungsrichtlinie), DIR_DEL (Delegierte Richtlinie),
DEC_IMPL (Durchführungsbeschluss), DEC_DEL (Delegierter Beschluss),
RECO (Empfehlung),
JUDG (Urteil), ORDER (Beschluss), OPIN_AG (Schlussanträge GA)

## Suchstrategie
1. eurlex_search sucht NUR in Titeln → für thematische Suche eurlex_by_eurovoc verwenden
2. Suchbegriffe in der Sprache des Titels verwenden
3. Bei Nicht-Treffern: Synonyme probieren ("KI" vs "künstliche Intelligenz")
4. Bekannte CELEX-ID? → Direkt eurlex_fetch oder eurlex_metadata nutzen
5. Rechtsbeziehungen? → eurlex_citations für Zitierungsketten
6. Konsolidierte Fassung? → eurlex_consolidated für geltendes Recht

## EuroVoc-Sprachbeispiele
- Bei language=ENG: "artificial intelligence", "data protection", "cybersecurity"
- Bei language=DEU: "künstliche Intelligenz", "Datenschutz", "Cybersicherheit"
- Bei language=FRA: "intelligence artificielle", "protection des données"
EuroVoc-Labels sind sprachabhängig — passende Sprache zum language-Parameter wählen!

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
