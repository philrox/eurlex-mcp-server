import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { fetchSchema } from '../schemas/fetchSchema.js';
import { CellarClient } from '../services/cellarClient.js';
import { processContent, toolError } from '../utils.js';

export async function handleEurlexFetch(input: {
  celex_id: string;
  language: string;
  format: 'plain' | 'xhtml';
  max_chars: number;
}): Promise<{ content: { type: 'text'; text: string }[]; isError?: true }> {
  try {
    const parsed = fetchSchema.parse(input);

    const client = new CellarClient();
    const raw = await client.fetchDocument(parsed.celex_id, parsed.language);
    const { content, truncated, charCount } = processContent(raw, parsed.format, parsed.max_chars);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            celex_id: parsed.celex_id,
            language: parsed.language,
            content,
            truncated,
            char_count: charCount,
            source_url: `https://publications.europa.eu/resource/celex/${parsed.celex_id}`,
          }),
        },
      ],
    };
  } catch (error) {
    return toolError(error);
  }
}

export function registerFetchTool(server: McpServer): void {
  server.tool(
    'eurlex_fetch',
    'Ruft Volltext eines EU-Rechtsakts per CELEX-ID ab',
    fetchSchema.shape,
    { readOnlyHint: true, destructiveHint: false },
    async (params) => handleEurlexFetch(params),
  );
}
