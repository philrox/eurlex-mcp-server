import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { eurovocSchema } from '../schemas/eurovocSchema.js';
import { CellarClient } from '../services/cellarClient.js';
import { toolError } from '../utils.js';

export async function handleEurlexByEurovoc(input: {
  concept: string;
  resource_type: string;
  language: string;
  limit: number;
}): Promise<{ content: { type: 'text'; text: string }[]; isError?: true }> {
  try {
    const parsed = eurovocSchema.parse(input);
    const client = new CellarClient();
    const results = await client.eurovocQuery(
      parsed.concept,
      parsed.resource_type,
      parsed.language,
      parsed.limit,
    );

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Keine Ergebnisse für EuroVoc-Konzept "${parsed.concept}"`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ results, total: results.length }),
        },
      ],
    };
  } catch (error) {
    return toolError(error);
  }
}

export function registerEurovocTool(server: McpServer): void {
  server.tool(
    'eurlex_by_eurovoc',
    'Sucht EU-Rechtsakte nach EuroVoc-Thema (z.B. "artificial intelligence", "data protection")',
    eurovocSchema.shape,
    { readOnlyHint: true, destructiveHint: false },
    async (params) => handleEurlexByEurovoc(params),
  );
}
