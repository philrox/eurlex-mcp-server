Teste den eurlex MCP Server vollständig. Verwende parallele subagents für
alle 6 Tools. Jeder Agent soll die folgenden Tests durchführen und exakte
Ergebnisse (PASS/FAIL + Details) zurückmelden:

**Agent 1 — eurlex_consolidated (Bug #1, #3 gefixt):**
1. reg/2024/1689, DEU, plain, max_chars 5000 → Muss AI Act Text enthalten
(nicht leer!)
2. reg/2016/679, ENG, plain, max_chars 5000 → Muss GDPR Text enthalten
3. dir/2019/1024, DEU, xhtml → Muss Open Data Directive enthalten
4. reg/2024/99999 → Muss Error mit "eurlex_fetch" Hinweis liefern
5. dec/2021/914, DEU → Teste Decision-Typ

**Agent 2 — eurlex_by_eurovoc (Bug #2, #8 gefixt):**
1. concept "artificial intelligence", ENG, limit 5 → Muss Ergebnisse
liefern (kein Timeout!)
2. concept "data protection", DEU, limit 3 → Muss Ergebnisse liefern
3. concept "Datenschutz", DEU → Deutsche Labels testen
4. concept "xyznonexistent123" → Muss "Keine Ergebnisse" liefern (kein
Timeout!)
5. concept "http://eurovoc.europa.eu/4424", ENG → URI-Pfad muss weiter
funktionieren
6. concept "climate change", resource_type "REG", ENG → Filter testen

**Agent 3 — eurlex_search (Bug #5 gefixt):**
1. query "intelligence artificielle", FRA, limit 10 → Keine doppelten
CELEX-IDs!
2. query "artificial intelligence", ENG → Grundfunktion
3. query "Datenschutz", DEU, resource_type "REG" → Filter
4. query "climate", ENG, date_from "2023-01-01", date_to "2024-12-31" →
Datumsfilter
5. query "AI" → Muss Validierungsfehler liefern (< 3 Zeichen)

**Agent 4 — eurlex_fetch (Bug #4 gefixt):**
1. celex_id "32024R1689", ENG, plain, max_chars 3000 → AI Act Text
2. celex_id "32016R0679", DEU, plain → GDPR Text
3. celex_id "31995L0046", DEU → Muss verbesserte Fehlermeldung liefern
("electronic full-text" oder "XHTML format")
4. celex_id "99999X9999" → Fehlerbehandlung

**Agent 5 — eurlex_citations (Bug #7 gefixt) + eurlex_metadata:**
1. eurlex_citations celex_id "99999X9999" → Muss "Keine Zitierungen
gefunden" Text liefern (nicht leeres JSON!)
2. eurlex_citations celex_id "32024R1689", direction "cites", DEU →
Zitierungen
3. eurlex_citations celex_id "32016R0679", direction "both", limit 5, ENG
→ Limit testen
4. eurlex_metadata celex_id "32024R1689", DEU → Metadaten prüfen
5. eurlex_metadata celex_id "99999X9999" → Fehlerbehandlung

Berichte am Ende eine Gesamtübersicht mit PASS/FAIL pro Test.
