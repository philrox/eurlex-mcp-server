import {
  SPARQL_ENDPOINT,
  CELLAR_REST_BASE,
  EURLEX_BASE,
  DEFAULT_LANGUAGE,
  DEFAULT_LIMIT,
} from '../constants.js';
import type { SparqlQueryParams, SearchResult } from '../types.js';

/** Maps 3-letter language codes to CDM expression language URI suffixes */
const LANGUAGE_URI_MAP: Record<string, string> = {
  DEU: 'DEU',
  ENG: 'ENG',
  FRA: 'FRA',
};

/** Maps 3-letter language codes to HTTP Accept-Language values */
const LANGUAGE_HTTP_MAP: Record<string, string> = {
  DEU: 'de',
  ENG: 'en',
  FRA: 'fr',
};

/** Shape of a single SPARQL binding value */
interface SparqlBindingValue {
  type: string;
  value: string;
}

/** Shape of the SPARQL JSON results */
interface SparqlResponse {
  results: {
    bindings: Array<{
      work: SparqlBindingValue;
      celex: SparqlBindingValue;
      title: SparqlBindingValue;
      date?: SparqlBindingValue;
      resType: SparqlBindingValue;
    }>;
  };
}

/**
 * Escapes a string for safe inclusion in a SPARQL literal.
 * Escapes backslashes and double-quotes.
 */
export function escapeSparqlString(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export class CellarClient {
  /**
   * Builds a SPARQL SELECT query from the given parameters.
   */
  buildSparqlQuery(params: SparqlQueryParams): string {
    const lang = LANGUAGE_URI_MAP[params.language] ?? params.language;
    const escaped = escapeSparqlString(params.query);

    const whereLines: string[] = [];

    // Resource type filter
    if (params.resource_type !== 'any') {
      whereLines.push(
        `    ?work cdm:work_has_resource-type <http://publications.europa.eu/resource/authority/resource-type/${params.resource_type}> .`
      );
    }

    // Always bind the resource type
    whereLines.push(
      '    ?work cdm:work_has_resource-type ?resTypeUri .',
      '    BIND(REPLACE(STR(?resTypeUri), "^.*/", "") AS ?resType)'
    );

    // CELEX identifier
    whereLines.push(
      '    ?work cdm:resource_legal_id_celex ?celex .'
    );

    // Expression and title (REQUIRED, not optional)
    whereLines.push(
      `    ?expr cdm:expression_belongs_to_work ?work .`,
      `    ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/${lang}> .`,
      `    ?expr cdm:expression_title ?title .`
    );

    // Date is OPTIONAL
    whereLines.push(
      '    OPTIONAL { ?work cdm:work_date_document ?date . }'
    );

    // Search filter on title
    whereLines.push(
      `    FILTER(CONTAINS(LCASE(STR(?title)), LCASE("${escaped}")))`
    );

    // Date filters
    if (params.date_from) {
      whereLines.push(
        `    FILTER(?date >= "${params.date_from}"^^xsd:date)`
      );
    }
    if (params.date_to) {
      whereLines.push(
        `    FILTER(?date <= "${params.date_to}"^^xsd:date)`
      );
    }

    const query = [
      'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>',
      'PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>',
      '',
      'SELECT DISTINCT ?work ?celex ?title ?date ?resType WHERE {',
      ...whereLines,
      '}',
      `ORDER BY DESC(?date)`,
      `LIMIT ${params.limit}`,
    ].join('\n');

    return query;
  }

  /**
   * Executes a SPARQL query against the EU Publications Office endpoint.
   * Merges provided params with defaults before building and executing the query.
   */
  async sparqlQuery(
    query: string,
    params?: Partial<SparqlQueryParams>
  ): Promise<SearchResult[]> {
    const fullParams: SparqlQueryParams = {
      query,
      resource_type: params?.resource_type ?? 'any',
      language: params?.language ?? DEFAULT_LANGUAGE,
      limit: params?.limit ?? DEFAULT_LIMIT,
      date_from: params?.date_from,
      date_to: params?.date_to,
    };

    const sparql = this.buildSparqlQuery(fullParams);

    const response = await fetch(SPARQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-query',
        Accept: 'application/sparql-results+json',
      },
      body: sparql,
    });

    if (!response.ok) {
      throw new Error(`SPARQL endpoint error: ${response.status}`);
    }

    const data = (await response.json()) as SparqlResponse;
    const lang = fullParams.language;

    return data.results.bindings.map((binding) => {
      const celex = binding.celex.value;
      return {
        celex,
        title: binding.title.value,
        date: binding.date?.value ?? '',
        type: binding.resType.value,
        eurlex_url: `${EURLEX_BASE}/${LANGUAGE_HTTP_MAP[lang] ?? 'de'}/TXT/?uri=CELEX:${celex}`,
      };
    });
  }

  /**
   * Fetches a document from EUR-Lex by CELEX identifier.
   * Uses the EUR-Lex HTML endpoint which is more reliable than the Cellar REST API
   * (Cellar often returns HTTP 202 with empty body for content negotiation).
   */
  async fetchDocument(celex_id: string, language: string): Promise<string> {
    const httpLang = LANGUAGE_HTTP_MAP[language] ?? 'de';
    const url = `${EURLEX_BASE}/${httpLang.toUpperCase()}/TXT/HTML/?uri=CELEX:${celex_id}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html',
      },
      redirect: 'follow',
    });

    if (response.status === 404) {
      throw new Error(`Document not found: ${celex_id}`);
    }

    if (!response.ok) {
      throw new Error(`Fetch error: ${response.status}`);
    }

    return response.text();
  }
}
