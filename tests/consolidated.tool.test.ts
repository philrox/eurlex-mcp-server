import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetchConsolidated = vi.fn()
vi.mock('../src/services/cellarClient.js', () => ({
  CellarClient: vi.fn().mockImplementation(() => ({
    fetchConsolidated: mockFetchConsolidated,
  })),
}))

import { handleEurlexConsolidated } from '../src/tools/consolidated.js'
import type { ConsolidatedResult } from '../src/types.js'

beforeEach(() => {
  vi.clearAllMocks()
})

const mockResult = (content: string, eliUrl = 'http://data.europa.eu/eli/reg/2024/1689/deu/xhtml') =>
  ({ content, eliUrl })

describe('handleEurlexConsolidated()', () => {
  it('CO7 – returns document content with truncation info', async () => {
    mockFetchConsolidated.mockResolvedValueOnce(mockResult('<html><body>Content</body></html>'))

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
    expect(parsed.eli_url).not.toContain('/oj/')
    expect(parsed.eli_url).toContain('/deu/xhtml')
  })

  it('CO8 – strips HTML in plain format', async () => {
    mockFetchConsolidated.mockResolvedValueOnce(mockResult('<html><body><p>Text</p></body></html>'))

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
    mockFetchConsolidated.mockResolvedValueOnce(mockResult('x'.repeat(30000)))

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

  it('CO-TYPE – result satisfies ConsolidatedResult shape', async () => {
    mockFetchConsolidated.mockResolvedValueOnce(mockResult('<html><body>Content</body></html>'))

    const result = await handleEurlexConsolidated({
      doc_type: 'reg',
      year: 2024,
      number: 1689,
      language: 'DEU',
      format: 'xhtml',
      max_chars: 20000,
    })

    const parsed: ConsolidatedResult = JSON.parse(result.content[0].text)
    const requiredKeys: (keyof ConsolidatedResult)[] = [
      'doc_type', 'year', 'number', 'language', 'content', 'truncated', 'char_count', 'eli_url',
    ]
    for (const key of requiredKeys) {
      expect(parsed).toHaveProperty(key)
    }
    expect(typeof parsed.doc_type).toBe('string')
    expect(typeof parsed.year).toBe('number')
    expect(typeof parsed.number).toBe('number')
    expect(typeof parsed.language).toBe('string')
    expect(typeof parsed.content).toBe('string')
    expect(typeof parsed.truncated).toBe('boolean')
    expect(typeof parsed.char_count).toBe('number')
    expect(typeof parsed.eli_url).toBe('string')
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
