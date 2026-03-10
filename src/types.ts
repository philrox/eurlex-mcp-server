export interface SparqlQueryParams {
  query: string
  resource_type: string
  language: string
  limit: number
  date_from?: string
  date_to?: string
}

export interface SearchResult {
  celex: string
  title: string
  date: string
  type: string
  eurlex_url: string
}

export interface FetchResult {
  celex_id: string
  title: string
  language: string
  content: string
  truncated: boolean
  char_count: number
  source_url: string
}

export interface SearchToolOutput {
  results: SearchResult[]
  total: number
  query_used: string
}

export interface MetadataResult {
  celex_id: string
  title: string
  date_document: string
  date_entry_into_force: string
  date_end_of_validity: string
  in_force: boolean | null
  date_transposition: string
  resource_type: string
  authors: string[]
  eurovoc_concepts: string[]
  directory_codes: string[]
  eurlex_url: string
}
