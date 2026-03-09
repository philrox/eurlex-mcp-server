import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SPARQL_ENDPOINT, CELLAR_REST_BASE } from '../src/constants.js'
import { CellarClient, escapeSparqlString } from '../src/services/cellarClient.js'

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------
const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})

// ---------------------------------------------------------------------------
// Helper to build a SPARQL JSON response body
// ---------------------------------------------------------------------------
function makeSparqlResponse(bindings: Array<{ work: string; title: string; date: string; resType: string }>) {
  return {
    results: {
      bindings: bindings.map(b => ({
        work: { type: 'uri', value: b.work },
        title: { type: 'literal', value: b.title },
        date: { type: 'literal', value: b.date },
        resType: { type: 'literal', value: b.resType },
      })),
    },
  }
}

// ===========================================================================
// Tests 1-5: sparqlQuery()
// ===========================================================================
describe('sparqlQuery()', () => {
  it('T1 – returns CELEX-IDs, title, and type from SPARQL response', async () => {
    const body = makeSparqlResponse([
      { work: 'http://publications.europa.eu/resource/celex/32021R0694', title: 'Regulation on X', date: '2021-05-01', resType: 'REG' },
      { work: 'http://publications.europa.eu/resource/celex/32020L0123', title: 'Directive on Y', date: '2020-03-15', resType: 'DIR' },
    ])

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => body,
    })

    const client = new CellarClient()
    const results = await client.sparqlQuery('test query')

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      celex: '32021R0694',
      title: 'Regulation on X',
      type: 'REG',
    })
    expect(results[1]).toMatchObject({
      celex: '32020L0123',
      title: 'Directive on Y',
      type: 'DIR',
    })
  })

  it('T2 – returns empty array when no results', async () => {
    const body = makeSparqlResponse([])

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => body,
    })

    const client = new CellarClient()
    const results = await client.sparqlQuery('xyznonexistent123')
    expect(results).toEqual([])
  })

  it('T3 – throws error on HTTP 500', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    const client = new CellarClient()
    await expect(client.sparqlQuery('test')).rejects.toThrow('SPARQL endpoint error: 500')
  })

  it('T4 – throws error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const client = new CellarClient()
    await expect(client.sparqlQuery('test')).rejects.toThrow('Network error')
  })

  it('T5 – sends SPARQL query via POST with Content-Type application/sparql-query', async () => {
    const body = makeSparqlResponse([])
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => body,
    })

    const client = new CellarClient()
    await client.sparqlQuery('test')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]

    expect(url).toBe(SPARQL_ENDPOINT)
    expect(options.method).toBe('POST')
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/sparql-query',
      Accept: 'application/sparql-results+json',
    })
  })
})

// ===========================================================================
// Tests 6-9: fetchDocument()
// ===========================================================================
describe('fetchDocument()', () => {
  it('T6 – returns XHTML content for valid CELEX-ID', async () => {
    const xhtmlContent = '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Article 1</p></body></html>'

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => xhtmlContent,
    })

    const client = new CellarClient()
    const result = await client.fetchDocument('32021R0694', 'DEU')
    expect(result).toBe(xhtmlContent)
  })

  it('T7 – throws error for unknown CELEX-ID (404)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })

    const client = new CellarClient()
    await expect(client.fetchDocument('00000X0000', 'DEU')).rejects.toThrow('Document not found: 00000X0000')
  })

  it('T8 – sets Accept: application/xhtml+xml and Accept-Language correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html></html>',
    })

    const client = new CellarClient()
    await client.fetchDocument('32021R0694', 'ENG')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]

    expect(url).toBe(`${CELLAR_REST_BASE}/32021R0694`)

    const headers = options.headers as Record<string, string>
    expect(headers['Accept']).toBe('application/xhtml+xml')
    expect(headers['Accept-Language']).toBe('en')
  })

  it('T9 – maps DEU to Accept-Language: de', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html></html>',
    })

    const client = new CellarClient()
    await client.fetchDocument('32021R0694', 'DEU')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Record<string, string>
    expect(headers['Accept-Language']).toBe('de')
  })
})

// ===========================================================================
// Tests 10-14: buildSparqlQuery()
// ===========================================================================
describe('buildSparqlQuery()', () => {
  const baseParams = {
    query: 'carbon border adjustment',
    resource_type: 'any',
    language: 'DEU',
    limit: 10,
  }

  it('T10 – includes REG filter when resource_type=REG', () => {
    const client = new CellarClient()
    const sparql = client.buildSparqlQuery({ ...baseParams, resource_type: 'REG' })

    expect(sparql).toContain('resource-type/REG')
    expect(sparql).toContain('SELECT')
  })

  it('T11 – has no type filter when resource_type=any', () => {
    const client = new CellarClient()
    const sparql = client.buildSparqlQuery({ ...baseParams, resource_type: 'any' })

    expect(sparql).toContain('SELECT')
    // Should not contain a specific resource-type filter URI
    expect(sparql).not.toContain('resource-type/REG')
    expect(sparql).not.toContain('resource-type/DIR')
    expect(sparql).not.toContain('resource-type/DEC')
  })

  it('T12 – includes date filter when date_from is set', () => {
    const client = new CellarClient()
    const sparql = client.buildSparqlQuery({ ...baseParams, date_from: '2021-01-01' })

    expect(sparql).toContain('2021-01-01')
    expect(sparql).toMatch(/FILTER/)
  })

  it('T13 – contains BIND for resType extraction', () => {
    const client = new CellarClient()
    const sparql = client.buildSparqlQuery(baseParams)

    expect(sparql).toMatch(/BIND/)
    expect(sparql).toContain('resType')
  })

  it('T14 – title triple is required, not OPTIONAL', () => {
    const client = new CellarClient()
    const sparql = client.buildSparqlQuery(baseParams)

    // Title must appear in the query
    expect(sparql).toContain('expression_title ?title')
    // Title must NOT be inside an OPTIONAL block
    expect(sparql).not.toMatch(/OPTIONAL\s*\{[^}]*title[^}]*\}/i)
    // Only one OPTIONAL (for date)
    const optionalMatches = sparql.match(/OPTIONAL/g) || []
    expect(optionalMatches.length).toBe(1)
  })
})

// ===========================================================================
// Test V21: SPARQL Injection — escapeSparqlString
// ===========================================================================
describe('escapeSparqlString()', () => {
  it('V21 – escapes quotes and backslashes to prevent SPARQL injection', () => {
    const malicious = 'test " value \\ injection'
    const escaped = escapeSparqlString(malicious)

    // Double quotes must be escaped
    expect(escaped).toContain('\\"')
    // Backslashes must be escaped
    expect(escaped).toContain('\\\\')

    // The escaped value should be safe to embed in a SPARQL string literal
    const sparqlLiteral = `"${escaped}"`
    const unescapedQuotes = sparqlLiteral.match(/(?<!\\)"/g)
    expect(unescapedQuotes).toHaveLength(2) // only the wrapper quotes
  })
})
