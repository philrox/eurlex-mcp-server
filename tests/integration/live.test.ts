/**
 * Phase 5 – Live Integration Tests (PRD Validation Matrix V1–V5)
 *
 * These tests hit the REAL EU Publications Office endpoints.
 * No mocks. Generous timeouts because the Cellar API can be slow.
 */

import { CellarClient } from '../../src/services/cellarClient.js'

const client = new CellarClient()

const TIMEOUT = 60_000 // 60 seconds per test (Cellar SPARQL can be slow)

describe('Phase 5 – Live Validation', () => {
  // V1: SPARQL Endpoint erreichbar (POST) → HTTP 200, JSON response
  it('V1: SPARQL endpoint is reachable and returns results', async () => {
    const results = await client.sparqlQuery('Datenschutz-Grundverordnung', { limit: 1 })
    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBeGreaterThanOrEqual(1)

    const first = results[0]
    expect(first).toHaveProperty('celex')
    expect(first).toHaveProperty('title')
    expect(first).toHaveProperty('type')
    expect(first).toHaveProperty('eurlex_url')
  }, TIMEOUT)

  // V2: AI Act auffindbar via Titel-Suche → CELEX 32024R1689 in Results
  it('V2: AI Act is findable via title search (CELEX 32024R1689)', async () => {
    const results = await client.sparqlQuery('künstliche Intelligenz', {
      language: 'DEU',
      limit: 50,
    })

    const celexIds = results.map((r) => r.celex)
    expect(celexIds).toContain('32024R1689')
  }, TIMEOUT)

  // V3: DSGVO auffindbar → CELEX 32016R0679
  it('V3: DSGVO is findable via title search (CELEX 32016R0679)', async () => {
    const results = await client.sparqlQuery('Datenschutz-Grundverordnung', {
      language: 'DEU',
      limit: 50,
    })

    const celexIds = results.map((r) => r.celex)
    expect(celexIds).toContain('32016R0679')
  }, TIMEOUT)

  // V4: Volltext AI Act abrufbar (DE, XHTML) → Content >10.000 Zeichen
  it('V4: AI Act full text retrievable in DE (>10.000 chars)', async () => {
    const content = await client.fetchDocument('32024R1689', 'DEU')

    expect(typeof content).toBe('string')
    expect(content.length).toBeGreaterThan(10_000)
  }, TIMEOUT)

  // V5: Volltext abrufbar (EN, XHTML) → Content >10.000 Zeichen
  it('V5: AI Act full text retrievable in EN (>10.000 chars)', async () => {
    const content = await client.fetchDocument('32024R1689', 'ENG')

    expect(typeof content).toBe('string')
    expect(content.length).toBeGreaterThan(10_000)
  }, TIMEOUT)
})
