import { consolidatedSchema } from '../schemas/consolidatedSchema.js'
import { CellarClient } from '../services/cellarClient.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export async function handleEurlexConsolidated(input: {
  doc_type: string
  year: number
  number: number
  language: string
  format: string
  max_chars: number
}) {
  try {
    const parsed = consolidatedSchema.parse(input)

    const client = new CellarClient()
    const { content: rawContent, eliUrl } = await client.fetchConsolidated(
      parsed.doc_type,
      parsed.year,
      parsed.number,
      parsed.language
    )

    let content = rawContent
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
            doc_type: parsed.doc_type,
            year: parsed.year,
            number: parsed.number,
            language: parsed.language,
            content,
            truncated,
            char_count: content.length,
            eli_url: eliUrl,
          }),
        },
      ],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
      isError: true,
    }
  }
}

export function registerConsolidatedTool(server: McpServer) {
  server.tool(
    'eurlex_consolidated',
    'Ruft die konsolidierte (aktuell gültige) Fassung eines EU-Rechtsakts ab via ELI',
    consolidatedSchema.shape,
    { readOnlyHint: true, destructiveHint: false },
    async (params) => handleEurlexConsolidated(params)
  )
}
