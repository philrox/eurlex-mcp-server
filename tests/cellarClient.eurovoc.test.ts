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
