import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock CellarClient — must be before importing the tool handler
// ---------------------------------------------------------------------------
const mockFetchDocument = vi.fn()

vi.mock('../src/services/cellarClient.js', () => ({
  CellarClient: vi.fn().mockImplementation(() => ({
    fetchDocument: mockFetchDocument,
  })),
}))

import { handleEurlexFetch } from '../src/tools/fetch.js'

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks()
})

// ===========================================================================
// Tests: handleEurlexFetch tool handler
// ===========================================================================
describe('handleEurlexFetch()', () => {
  it('T18 – returns document content successfully (happy path)', async () => {
    mockFetchDocument.mockResolvedValueOnce('<div><p>Artikel 1</p></div>')

    const result = await handleEurlexFetch({
      celex_id: '32024R1689',
      language: 'DEU',
      format: 'xhtml',
      max_chars: 20000,
    })

    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result).not.toHaveProperty('isError')

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.celex_id).toBe('32024R1689')
    expect(parsed.content).toContain('Artikel 1')
  })

  it('T18b – content truncated when exceeding max_chars', async () => {
    mockFetchDocument.mockResolvedValueOnce('x'.repeat(25000))

    const result = await handleEurlexFetch({
      celex_id: '32024R1689',
      language: 'DEU',
      format: 'xhtml',
      max_chars: 20000,
    })

    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.truncated).toBe(true)
    expect(parsed.content.length).toBeLessThanOrEqual(20000)
  })

  it('T19 – returns isError: true when fetchDocument throws', async () => {
    mockFetchDocument.mockRejectedValueOnce(new Error('Document not found'))

    const result = await handleEurlexFetch({
      celex_id: '32024R1689',
      language: 'DEU',
      format: 'xhtml',
      max_chars: 20000,
    })

    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain('Document not found')
  })

  it('T19b – returns isError: true when schema validation fails (invalid CELEX-ID)', async () => {
    const result = await handleEurlexFetch({
      celex_id: 'INVALID!!!',
      language: 'DEU',
      format: 'xhtml',
      max_chars: 20000,
    })

    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toMatch(/Error:/)
  })

  it('T20 – plain format removes XHTML tags', async () => {
    mockFetchDocument.mockResolvedValueOnce(
      '<div><p>Artikel 1: Gegenstand</p></div>'
    )

    const result = await handleEurlexFetch({
      celex_id: '32024R1689',
      language: 'DEU',
      format: 'plain',
      max_chars: 20000,
    })

    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')

    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.content).not.toContain('<div>')
    expect(parsed.content).toContain('Artikel 1')
  })
})
