import { describe, it, expect } from 'vitest'
import { stripHtml, toolError, processContent } from '../src/utils.js'

describe('stripHtml()', () => {
  it('removes script and style tags with their content', () => {
    const input = '<html><script>if (a > b) { alert("x") }</script><p>Hello</p><style>.foo { color: red }</style></html>'
    const result = stripHtml(input)
    expect(result).not.toContain('alert')
    expect(result).not.toContain('color')
    expect(result).toContain('Hello')
  })

  it('removes plain HTML tags', () => {
    const result = stripHtml('<div><p>Text</p></div>')
    expect(result).toBe('Text')
  })
})

describe('toolError()', () => {
  it('wraps an Error instance into MCP error response', () => {
    const result = toolError(new Error('something broke'))
    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toBe('Error: something broke')
  })

  it('wraps a string into MCP error response', () => {
    const result = toolError('raw string error')
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: raw string error')
  })

  it('wraps a non-Error object into MCP error response', () => {
    const result = toolError(42)
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: 42')
  })
})

describe('processContent()', () => {
  it('returns content as-is for xhtml format', () => {
    const result = processContent('<p>Hello</p>', 'xhtml', 1000)
    expect(result.content).toBe('<p>Hello</p>')
    expect(result.truncated).toBe(false)
    expect(result.charCount).toBe(12)
  })

  it('strips HTML for plain format', () => {
    const result = processContent('<p>Hello</p>', 'plain', 1000)
    expect(result.content).toBe('Hello')
    expect(result.charCount).toBe(5)
  })

  it('truncates and reports original charCount', () => {
    const long = 'x'.repeat(5000)
    const result = processContent(long, 'xhtml', 1000)
    expect(result.truncated).toBe(true)
    expect(result.charCount).toBe(5000)
    expect(result.content.length).toBe(1000)
  })

  it('strips HTML before measuring charCount', () => {
    const html = '<div>' + 'x'.repeat(100) + '</div>'
    const result = processContent(html, 'plain', 50)
    expect(result.charCount).toBe(100) // length after stripping, before truncation
    expect(result.truncated).toBe(true)
    expect(result.content.length).toBe(50)
  })

  it('returns contentLength equal to actual content length after truncation', () => {
    const result = processContent('x'.repeat(5000), 'xhtml', 1000)
    expect(result.contentLength).toBe(1000)
    expect(result.charCount).toBe(5000)
  })

  it('returns matching contentLength and charCount when no truncation', () => {
    const result = processContent('hello world', 'xhtml', 20000)
    expect(result.contentLength).toBe(11)
    expect(result.charCount).toBe(11)
    expect(result.truncated).toBe(false)
  })

  it('rejects invalid format at type level', () => {
    // @ts-expect-error — 'pdf' is not assignable to 'plain' | 'xhtml'
    processContent('<p>test</p>', 'pdf', 1000)
  })
})
