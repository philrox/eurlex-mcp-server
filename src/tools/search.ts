import { CellarClient } from '../services/cellarClient.js'
import type { SearchResult } from '../types.js'

export async function handleEurlexSearch(input: {
  query: string
  resource_type: string
  language: string
  limit: number
  date_from?: string
  date_to?: string
}) {
  try {
    const client = new CellarClient()
    const results: SearchResult[] = await client.sparqlQuery(input.query, {
      resource_type: input.resource_type,
      language: input.language,
      limit: input.limit,
      date_from: input.date_from,
      date_to: input.date_to,
    })

    if (results.length === 0) {
      return {
        content: [{ type: 'text' as const, text: `Keine Ergebnisse für "${input.query}"` }],
      }
    }

    const queryParams = {
      query: input.query,
      resource_type: input.resource_type,
      language: input.language,
      limit: input.limit,
      date_from: input.date_from,
      date_to: input.date_to,
    }
    const query_used = typeof client.buildSparqlQuery === 'function'
      ? client.buildSparqlQuery(queryParams)
      : input.query

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ results, total: results.length, query_used }),
      }],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
      isError: true,
    }
  }
}
