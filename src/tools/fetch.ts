import { fetchSchema } from '../schemas/fetchSchema.js'
import { CellarClient } from '../services/cellarClient.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export async function handleEurlexFetch(input: {
  celex_id: string
  language: string
  format: string
  max_chars: number
}) {
  const parsed = fetchSchema.parse(input)

  const client = new CellarClient()
  let content = await client.fetchDocument(parsed.celex_id, parsed.language)

  if (parsed.format === 'plain') {
    content = content.replace(/<[^>]*>/g, '')
  }

  const truncated = content.length > parsed.max_chars
  if (truncated) {
    content = content.slice(0, parsed.max_chars)
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          celex_id: parsed.celex_id,
          language: parsed.language,
          content,
          truncated,
          char_count: content.length,
          source_url: `https://publications.europa.eu/resource/celex/${parsed.celex_id}`,
        }),
      },
    ],
  }
}

export function registerFetchTool(server: McpServer) {
  server.tool(
    'eurlex_fetch',
    'Ruft Volltext eines EU-Rechtsakts per CELEX-ID ab',
    fetchSchema.shape,
    async (params) => handleEurlexFetch(params)
  )
}
