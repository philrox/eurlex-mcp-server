import { citationsSchema } from '../schemas/citationsSchema.js'
import { CellarClient } from '../services/cellarClient.js'
import { toolError } from '../utils.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export async function handleEurlexCitations(input: {
  celex_id: string
  language: string
  direction: 'cites' | 'cited_by' | 'both'
  limit: number
}) {
  try {
    const parsed = citationsSchema.parse(input)
    const client = new CellarClient()
    const result = await client.citationsQuery(
      parsed.celex_id,
      parsed.language,
      parsed.direction,
      parsed.limit
    )

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result),
      }],
    }
  } catch (error) {
    return toolError(error)
  }
}

export function registerCitationsTool(server: McpServer) {
  server.tool(
    'eurlex_citations',
    'Findet Zitierungen, Rechtsgrundlagen und Änderungen eines EU-Rechtsakts',
    citationsSchema.shape,
    { readOnlyHint: true, destructiveHint: false },
    async (params) => handleEurlexCitations(params)
  )
}
