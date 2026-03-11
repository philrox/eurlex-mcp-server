import {
  SPARQL_ENDPOINT,
  CELLAR_REST_BASE,
  EURLEX_BASE,
  DEFAULT_LANGUAGE,
  DEFAULT_LIMIT,
} from '../constants.js';
import type { SparqlQueryParams, SearchResult, MetadataResult, CitationsResult, CitationEntry } from '../types.js';

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

/** Maps 3-letter language codes to ELI URL language codes (ISO 639-3) */
const LANGUAGE_ELI_MAP: Record<string, string> = {
  DEU: 'deu',
  ENG: 'eng',
  FRA: 'fra',
};

/** Shape of a single SPARQL binding value */
interface SparqlBindingValue {
  type: string;
  value: string;
}

/** Shape of the metadata SPARQL JSON results */
interface MetadataSparqlResponse {
  results: {
    bindings: Array<{
      title?: SparqlBindingValue;
      dateDoc?: SparqlBindingValue;
      dateForce?: SparqlBindingValue;
      dateEnd?: SparqlBindingValue;
      inForce?: SparqlBindingValue;
      dateTrans?: SparqlBindingValue;
      resType?: SparqlBindingValue;
      authors?: SparqlBindingValue;
      eurovoc?: SparqlBindingValue;
      dirCodes?: SparqlBindingValue;
    }>;
  };
}

/** Shape of the citations SPARQL JSON results */
interface CitationsSparqlResponse {
  results: {
    bindings: Array<{
      celex: SparqlBindingValue;
      title: SparqlBindingValue;
      date?: SparqlBindingValue;
      resType: SparqlBindingValue;
      rel: SparqlBindingValue;
    }>;
  };
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
   * Fetches a document from Cellar by CELEX identifier using content negotiation.
   * Uses Accept-Language header to select the language variant.
   */
  async fetchDocument(celex_id: string, language: string): Promise<string> {
    const httpLang = LANGUAGE_HTTP_MAP[language] ?? 'de';
    const url = `${CELLAR_REST_BASE}/${celex_id}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/xhtml+xml',
        'Accept-Language': httpLang,
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

  /**
   * Builds a SPARQL query to retrieve metadata for a given CELEX ID.
   */
  buildMetadataQuery(celexId: string, language: string): string {
    const lang = LANGUAGE_URI_MAP[language] ?? language;
    const langLower = LANGUAGE_HTTP_MAP[language] ?? 'de';

    const query = [
      'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>',
      'PREFIX skos: <http://www.w3.org/2004/02/skos/core#>',
      'PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>',
      '',
      'SELECT ?title ?dateDoc ?dateForce ?dateEnd ?inForce ?dateTrans ?resType',
      '  (GROUP_CONCAT(DISTINCT ?authorName; separator="|||") AS ?authors)',
      '  (GROUP_CONCAT(DISTINCT ?evLabel; separator="|||") AS ?eurovoc)',
      '  (GROUP_CONCAT(DISTINCT ?dirCode; separator="|||") AS ?dirCodes)',
      'WHERE {',
      `  ?work cdm:resource_legal_id_celex ?celexVal .`,
      `  FILTER(STR(?celexVal) = "${escapeSparqlString(celexId)}")`,
      `  ?expr cdm:expression_belongs_to_work ?work .`,
      `  ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/${lang}> .`,
      `  ?expr cdm:expression_title ?title .`,
      '  OPTIONAL { ?work cdm:work_date_document ?dateDoc . }',
      '  OPTIONAL { ?work cdm:resource_legal_date_entry-into-force ?dateForce . }',
      '  OPTIONAL { ?work cdm:resource_legal_date_end-of-validity ?dateEnd . }',
      '  OPTIONAL { ?work cdm:resource_legal_in-force ?inForce . }',
      '  OPTIONAL { ?work cdm:resource_legal_date_transposition ?dateTrans . }',
      '  OPTIONAL {',
      '    ?work cdm:work_has_resource-type ?resTypeUri .',
      '    BIND(REPLACE(STR(?resTypeUri), "^.*/", "") AS ?resType)',
      '  }',
      '  OPTIONAL {',
      '    ?work cdm:work_created_by_agent ?agent .',
      '    ?agent cdm:agent_name ?authorName .',
      '  }',
      '  OPTIONAL {',
      '    ?work cdm:work_is_about_concept_eurovoc ?evConcept .',
      '    ?evConcept skos:prefLabel ?evLabel .',
      `    FILTER(LANG(?evLabel) = "${langLower}")`,
      '  }',
      '  OPTIONAL {',
      '    ?work cdm:resource_legal_is_about_concept_directory-code ?dirCode .',
      '  }',
      '}',
      'GROUP BY ?title ?dateDoc ?dateForce ?dateEnd ?inForce ?dateTrans ?resType',
    ].join('\n');

    return query;
  }

  /**
   * Fetches metadata for a CELEX ID from the SPARQL endpoint.
   */
  async metadataQuery(celexId: string, language: string): Promise<MetadataResult> {
    const sparql = this.buildMetadataQuery(celexId, language);

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

    const data = (await response.json()) as MetadataSparqlResponse;

    if (data.results.bindings.length === 0) {
      throw new Error(`No metadata found for CELEX: ${celexId}`);
    }

    const binding = data.results.bindings[0];
    const httpLang = LANGUAGE_HTTP_MAP[language] ?? 'de';

    const splitConcat = (value: string | undefined): string[] => {
      if (!value) return [];
      return value.split('|||').filter((s) => s !== '');
    };

    const parseInForce = (value: string | undefined): boolean | null => {
      if (value === 'true' || value === '1') return true;
      if (value === 'false' || value === '0') return false;
      return null;
    };

    return {
      celex_id: celexId,
      title: binding.title?.value ?? '',
      date_document: binding.dateDoc?.value ?? '',
      date_entry_into_force: binding.dateForce?.value ?? '',
      date_end_of_validity: binding.dateEnd?.value ?? '',
      in_force: parseInForce(binding.inForce?.value),
      date_transposition: binding.dateTrans?.value ?? '',
      resource_type: binding.resType?.value ?? '',
      authors: splitConcat(binding.authors?.value),
      eurovoc_concepts: splitConcat(binding.eurovoc?.value),
      directory_codes: splitConcat(binding.dirCodes?.value),
      eurlex_url: `${EURLEX_BASE}/${httpLang}/TXT/?uri=CELEX:${celexId}`,
    };
  }

  /**
   * Builds a SPARQL query to retrieve citations/relationships for a given CELEX ID.
   */
  buildCitationsQuery(
    celexId: string,
    language: string,
    direction: 'cites' | 'cited_by' | 'both',
    limit: number
  ): string {
    const lang = LANGUAGE_URI_MAP[language] ?? language;
    const escaped = escapeSparqlString(celexId);

    // Use FILTER(STR(...)) for CELEX matching — literals may be typed as xsd:string
    const sourceFilter = `    ?sourceWork cdm:resource_legal_id_celex ?srcCelex .\n    FILTER(STR(?srcCelex) = "${escaped}")`;

    const citesBlock = [
      '  {',
      sourceFilter,
      '    { ?sourceWork cdm:work_cites_work ?relWork . BIND("cites" AS ?rel) }',
      '    UNION',
      '    { ?sourceWork cdm:resource_legal_based_on_resource_legal ?relWork . BIND("based_on" AS ?rel) }',
      '    UNION',
      '    { ?sourceWork cdm:resource_legal_amends_resource_legal ?relWork . BIND("amends" AS ?rel) }',
      '    UNION',
      '    { ?sourceWork cdm:resource_legal_repeals_resource_legal ?relWork . BIND("repeals" AS ?rel) }',
      '  }',
    ].join('\n');

    const citedByBlock = [
      '  {',
      `    ?relWork cdm:work_cites_work ?sourceWork .`,
      sourceFilter,
      '    BIND("cited_by" AS ?rel)',
      '  }',
      '  UNION',
      '  {',
      `    ?relWork cdm:resource_legal_based_on_resource_legal ?sourceWork .`,
      sourceFilter,
      '    BIND("basis_for" AS ?rel)',
      '  }',
      '  UNION',
      '  {',
      `    ?relWork cdm:resource_legal_amends_resource_legal ?sourceWork .`,
      sourceFilter,
      '    BIND("amended_by" AS ?rel)',
      '  }',
      '  UNION',
      '  {',
      `    ?relWork cdm:resource_legal_repeals_resource_legal ?sourceWork .`,
      sourceFilter,
      '    BIND("repealed_by" AS ?rel)',
      '  }',
    ].join('\n');

    let body: string;
    if (direction === 'cites') body = citesBlock;
    else if (direction === 'cited_by') body = citedByBlock;
    else body = `${citesBlock}\n  UNION\n${citedByBlock}`;

    return [
      'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>',
      '',
      'SELECT DISTINCT ?celex ?title ?date ?resType ?rel WHERE {',
      body,
      '  ?relWork cdm:resource_legal_id_celex ?celex .',
      '  ?relWork cdm:work_has_resource-type ?resTypeUri .',
      '  BIND(REPLACE(STR(?resTypeUri), "^.*/", "") AS ?resType)',
      `  ?relExpr cdm:expression_belongs_to_work ?relWork .`,
      `  ?relExpr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/${lang}> .`,
      '  ?relExpr cdm:expression_title ?title .',
      '  OPTIONAL { ?relWork cdm:work_date_document ?date . }',
      '}',
      'ORDER BY DESC(?date)',
      `LIMIT ${limit}`,
    ].join('\n');
  }

  /**
   * Fetches citations/relationships for a CELEX ID from the SPARQL endpoint.
   */
  async citationsQuery(
    celexId: string,
    language: string,
    direction: 'cites' | 'cited_by' | 'both',
    limit: number
  ): Promise<CitationsResult> {
    const sparql = this.buildCitationsQuery(celexId, language, direction, limit);
    const httpLang = LANGUAGE_HTTP_MAP[language] ?? 'de';

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

    const data = (await response.json()) as CitationsSparqlResponse;
    const citations = data.results.bindings.map((b) => ({
      celex: b.celex.value,
      title: b.title.value,
      date: b.date?.value ?? '',
      type: b.resType.value,
      relationship: b.rel.value as CitationEntry['relationship'],
      eurlex_url: `${EURLEX_BASE}/${httpLang}/TXT/?uri=CELEX:${b.celex.value}`,
    }));

    return {
      celex_id: celexId,
      citations,
      total: citations.length,
    };
  }

  /**
   * Builds a SPARQL query to find EU legal acts by EuroVoc concept.
   * Accepts either a label string (resolved via skos:prefLabel) or a direct URI.
   */
  buildEurovocQuery(
    concept: string,
    resourceType: string,
    language: string,
    limit: number
  ): string {
    const lang = LANGUAGE_URI_MAP[language] ?? language;
    const isUri = concept.startsWith('http');

    if (isUri && /[><\s"{}|\\^`]/.test(concept)) {
      throw new Error(`Invalid URI: contains characters not allowed in SPARQL IRIs`);
    }

    const conceptFilter = isUri
      ? `  ?work cdm:work_is_about_concept_eurovoc <${concept}> .`
      : [
          `  ?work cdm:work_is_about_concept_eurovoc ?evConcept .`,
          `  ?evConcept skos:prefLabel ?evLabel .`,
          `  FILTER(CONTAINS(LCASE(STR(?evLabel)), LCASE("${escapeSparqlString(concept)}")))`,
        ].join('\n');

    const typeFilter = resourceType !== 'any'
      ? `  ?work cdm:work_has_resource-type <http://publications.europa.eu/resource/authority/resource-type/${resourceType}> .`
      : '';

    return [
      'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>',
      'PREFIX skos: <http://www.w3.org/2004/02/skos/core#>',
      'PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>',
      '',
      'SELECT DISTINCT ?work ?celex ?title ?date ?resType WHERE {',
      conceptFilter,
      typeFilter,
      '  ?work cdm:resource_legal_id_celex ?celex .',
      '  ?work cdm:work_has_resource-type ?resTypeUri .',
      '  BIND(REPLACE(STR(?resTypeUri), "^.*/", "") AS ?resType)',
      `  ?expr cdm:expression_belongs_to_work ?work .`,
      `  ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/${lang}> .`,
      '  ?expr cdm:expression_title ?title .',
      '  OPTIONAL { ?work cdm:work_date_document ?date . }',
      `  FILTER NOT EXISTS { ?work cdm:do_not_index "true"^^xsd:boolean }`,
      '}',
      'ORDER BY DESC(?date)',
      `LIMIT ${limit}`,
    ].join('\n');
  }

  /**
   * Executes a EuroVoc concept query against the SPARQL endpoint and returns search results.
   */
  async eurovocQuery(
    concept: string,
    resourceType: string,
    language: string,
    limit: number
  ): Promise<SearchResult[]> {
    const sparql = this.buildEurovocQuery(concept, resourceType, language, limit);
    const httpLang = LANGUAGE_HTTP_MAP[language] ?? 'de';

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
    return data.results.bindings.map((b) => ({
      celex: b.celex.value,
      title: b.title.value,
      date: b.date?.value ?? '',
      type: b.resType.value,
      eurlex_url: `${EURLEX_BASE}/${httpLang}/TXT/?uri=CELEX:${b.celex.value}`,
    }));
  }

  /**
   * Fetches the consolidated (currently applicable) version of an EU legal act via ELI URL.
   */
  async fetchConsolidated(
    docType: string,
    year: number,
    number: number,
    language: string
  ): Promise<{ content: string; eliUrl: string }> {
    const eliLang = LANGUAGE_ELI_MAP[language] ?? 'deu'
    const eliUrl = `http://data.europa.eu/eli/${docType}/${year}/${number}/${eliLang}/xhtml`

    const response = await fetch(eliUrl, {
      method: 'GET',
      headers: { Accept: 'application/xhtml+xml' },
      redirect: 'follow',  // ELI URLs redirect to EUR-Lex
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          `Keine konsolidierte Fassung für ${docType}/${year}/${number} verfügbar. ` +
          `Verwenden Sie eurlex_fetch mit der CELEX-ID für die Original-OJ-Version.`
        )
      }
      throw new Error(`Consolidated document error: ${docType}/${year}/${number} (HTTP ${response.status})`)
    }

    return { content: await response.text(), eliUrl }
  }
}
