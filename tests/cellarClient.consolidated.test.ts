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

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('data.europa.eu/eli/reg/2024/1689')
    expect(url).not.toContain('/oj/')
    expect(url).toContain('/deu/xhtml')
    expect((opts.headers as Record<string, string>).Accept).toBe('application/xhtml+xml')
  })

  it('CO5 – returns content and eliUrl', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body>Artikel 1</body></html>',
    })

    const client = new CellarClient()
    const result = await client.fetchConsolidated('dir', 2022, 2555, 'DEU')

    expect(result.content).toContain('Artikel 1')
    expect(result.eliUrl).toContain('data.europa.eu/eli/dir/2022/2555/deu/xhtml')
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

  it('CO6b – defaults to deu for unmapped language code', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body>Testo consolidato</body></html>',
    })

    const client = new CellarClient()
    await client.fetchConsolidated('reg', 2024, 1689, 'ITA')

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/deu/xhtml')
  })
})
