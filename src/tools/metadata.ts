import { metadataSchema } from '../schemas/metadataSchema.js'
import { CellarClient } from '../services/cellarClient.js'
import { toolError } from '../utils.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export async function handleEurlexMetadata(input: {
  celex_id: string
  language: string
}) {
  try {
    const parsed = metadataSchema.parse(input)
    const client = new CellarClient()
    const result = await client.metadataQuery(parsed.celex_id, parsed.language)
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    }
  } catch (error) {
    return toolError(error)
  }
}

export function registerMetadataTool(server: McpServer) {
  server.tool(
    'eurlex_metadata',
    'Ruft detaillierte Metadaten eines EU-Rechtsakts per CELEX-ID ab (Daten, Autoren, EuroVoc, Directory-Codes)',
    metadataSchema.shape,
    { readOnlyHint: true, destructiveHint: false },
    async (params) => handleEurlexMetadata(params)
  )
}
