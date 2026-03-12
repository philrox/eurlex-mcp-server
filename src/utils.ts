export function stripHtml(content: string): string {
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '')
}

export function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true as const,
  }
}

export function processContent(
  raw: string,
  format: 'plain' | 'xhtml',
  maxChars: number
): { content: string; truncated: boolean; charCount: number; contentLength: number } {
  let content = format === 'plain' ? stripHtml(raw) : raw
  const charCount = content.length
  const truncated = charCount > maxChars
  if (truncated) content = content.slice(0, maxChars)
  return { content, truncated, charCount, contentLength: content.length }
}
