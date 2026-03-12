import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { consolidatedSchema } from '../schemas/consolidatedSchema.js';
import { CellarClient } from '../services/cellarClient.js';
import type { ConsolidatedResult } from '../types.js';
import { processContent, toolError } from '../utils.js';

export async function handleEurlexConsolidated(input: {
  doc_type: string;
  year: number;
  number: number;
  language: string;
  format: 'plain' | 'xhtml';
  max_chars: number;
}): Promise<{ content: { type: 'text'; text: string }[]; isError?: true }> {
  try {
    const parsed = consolidatedSchema.parse(input);

    const client = new CellarClient();
    const { content: rawContent, eliUrl } = await client.fetchConsolidated(
      parsed.doc_type,
      parsed.year,
      parsed.number,
      parsed.language,
    );

    const { content, truncated, charCount } = processContent(
      rawContent,
      parsed.format,
      parsed.max_chars,
    );

    const result: ConsolidatedResult = {
      doc_type: parsed.doc_type,
      year: parsed.year,
      number: parsed.number,
      language: parsed.language,
      content,
      truncated,
      char_count: charCount,
      eli_url: eliUrl,
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result),
        },
      ],
    };
  } catch (error) {
    return toolError(error);
  }
}

export function registerConsolidatedTool(server: McpServer): void {
  server.tool(
    'eurlex_consolidated',
    'Ruft die konsolidierte (aktuell gültige) Fassung eines EU-Rechtsakts ab via ELI',
    consolidatedSchema.shape,
    { readOnlyHint: true, destructiveHint: false },
    async (params) => handleEurlexConsolidated(params),
  );
}
