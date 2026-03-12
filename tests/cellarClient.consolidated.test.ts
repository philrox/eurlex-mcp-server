import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CellarClient } from '../src/services/cellarClient.js'

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})

/** Helper: mock a SPARQL response returning a consolidated CELEX ID */
function mockSparqlCelexResponse(celex: string) {
  return {
    ok: true,
    json: async () => ({
      results: {
        bindings: [{ celex: { type: 'literal', value: celex } }],
      },
    }),
  }
}

/** Helper: mock a SPARQL response with no results */
function mockSparqlEmptyResponse() {
  return {
    ok: true,
    json: async () => ({ results: { bindings: [] } }),
  }
}

/** Helper: mock a Cellar REST document response */
function mockDocumentResponse(content: string) {
  return {
    ok: true,
    text: async () => content,
  }
}

describe('fetchConsolidated()', () => {
  it('CO4 – step 1: queries SPARQL for consolidated CELEX ID', async () => {
    mockFetch
      .mockResolvedValueOnce(mockSparqlCelexResponse('02024R1689-20240712'))
      .mockResolvedValueOnce(mockDocumentResponse('<html><body>Consolidated text</body></html>'))

    const client = new CellarClient()
    await client.fetchConsolidated('reg', 2024, 1689, 'DEU')

    // First call should be SPARQL to find consolidated CELEX
    const [url1, opts1] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url1).toContain('sparql')
    expect(opts1.body).toContain('02024R1689')
  })

  it('CO4b – step 2: fetches document from Cellar REST using resolved CELEX', async () => {
    mockFetch
      .mockResolvedValueOnce(mockSparqlCelexResponse('02024R1689-20240712'))
      .mockResolvedValueOnce(mockDocumentResponse('<html><body>Consolidated text</body></html>'))

    const client = new CellarClient()
    await client.fetchConsolidated('reg', 2024, 1689, 'DEU')

    // Second call should be Cellar REST with the consolidated CELEX
    const [url2, opts2] = mockFetch.mock.calls[1] as [string, RequestInit]
    expect(url2).toContain('publications.europa.eu/resource/celex/02024R1689-20240712')
    expect((opts2.headers as Record<string, string>).Accept).toBe('application/xhtml+xml')
    expect((opts2.headers as Record<string, string>)['Accept-Language']).toBe('de')
  })

  it('CO5 – returns content and eliUrl', async () => {
    mockFetch
      .mockResolvedValueOnce(mockSparqlCelexResponse('02022L2555-20230101'))
      .mockResolvedValueOnce(mockDocumentResponse('<html><body>Artikel 1</body></html>'))

    const client = new CellarClient()
    const result = await client.fetchConsolidated('dir', 2022, 2555, 'DEU')

    expect(result.content).toContain('Artikel 1')
    expect(result.eliUrl).toContain('data.europa.eu/eli/dir/2022/2555')
  })

  it('CO6 – throws when no consolidated CELEX found via SPARQL', async () => {
    mockFetch.mockResolvedValueOnce(mockSparqlEmptyResponse())

    const client = new CellarClient()
    await expect(client.fetchConsolidated('reg', 9999, 9999, 'DEU'))
      .rejects.toThrow(/eurlex_fetch/)
  })

  it('CO6b – maps doc_type to CELEX prefix correctly (R=reg, L=dir, D=dec)', async () => {
    // Test directive
    mockFetch
      .mockResolvedValueOnce(mockSparqlCelexResponse('02019L1024-20240101'))
      .mockResolvedValueOnce(mockDocumentResponse('<html><body>Directive content</body></html>'))

    const client = new CellarClient()
    await client.fetchConsolidated('dir', 2019, 1024, 'DEU')

    const sparqlBody = (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string
    expect(sparqlBody).toContain('02019L1024')
  })

  it('CO-ENG – uses correct Accept-Language for ENG', async () => {
    mockFetch
      .mockResolvedValueOnce(mockSparqlCelexResponse('02016R0679-20180525'))
      .mockResolvedValueOnce(mockDocumentResponse('<html><body>English content</body></html>'))

    const client = new CellarClient()
    await client.fetchConsolidated('reg', 2016, 679, 'ENG')

    const [, opts2] = mockFetch.mock.calls[1] as [string, RequestInit]
    expect((opts2.headers as Record<string, string>)['Accept-Language']).toBe('en')
  })

  it('CO-FRA – uses correct Accept-Language for FRA', async () => {
    mockFetch
      .mockResolvedValueOnce(mockSparqlCelexResponse('02016R0679-20180525'))
      .mockResolvedValueOnce(mockDocumentResponse('<html><body>Contenu français</body></html>'))

    const client = new CellarClient()
    await client.fetchConsolidated('reg', 2016, 679, 'FRA')

    const [, opts2] = mockFetch.mock.calls[1] as [string, RequestInit]
    expect((opts2.headers as Record<string, string>)['Accept-Language']).toBe('fr')
  })

  it('CO-404 – throws with eurlex_fetch hint when Cellar REST returns 404', async () => {
    mockFetch
      .mockResolvedValueOnce(mockSparqlCelexResponse('02024R1689-20240712'))
      .mockResolvedValueOnce({ ok: false, status: 404 })

    const client = new CellarClient()
    await expect(client.fetchConsolidated('reg', 2024, 1689, 'DEU'))
      .rejects.toThrow(/eurlex_fetch/)
  })

  it('CO-500 – handles non-404 HTTP errors from Cellar REST', async () => {
    mockFetch
      .mockResolvedValueOnce(mockSparqlCelexResponse('02016R0679-20180525'))
      .mockResolvedValueOnce({ ok: false, status: 500 })

    const client = new CellarClient()
    await expect(client.fetchConsolidated('reg', 2016, 679, 'ENG'))
      .rejects.toThrow(/500/)
  })

  it('CO-DEC – maps dec doc_type to D in CELEX prefix', async () => {
    mockFetch
      .mockResolvedValueOnce(mockSparqlCelexResponse('02021D0914-20230101'))
      .mockResolvedValueOnce(mockDocumentResponse('<html><body>Decision content</body></html>'))

    const client = new CellarClient()
    await client.fetchConsolidated('dec', 2021, 914, 'DEU')

    const sparqlBody = (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string
    expect(sparqlBody).toContain('02021D0914')
  })
})
