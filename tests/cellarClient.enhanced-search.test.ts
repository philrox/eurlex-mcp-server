import { describe, it, expect } from 'vitest'
import { searchSchema } from '../src/schemas/searchSchema.js'
import { CellarClient } from '../src/services/cellarClient.js'

describe('enhanced searchSchema', () => {
  it('ES1 – accepts REG_IMPL resource type', () => {
    const result = searchSchema.parse({ query: 'test query', resource_type: 'REG_IMPL' })
    expect(result.resource_type).toBe('REG_IMPL')
  })

  it('ES2 – accepts REG_DEL resource type', () => {
    const result = searchSchema.parse({ query: 'test query', resource_type: 'REG_DEL' })
    expect(result.resource_type).toBe('REG_DEL')
  })

  it('ES3 – accepts DIR_IMPL resource type', () => {
    const result = searchSchema.parse({ query: 'test query', resource_type: 'DIR_IMPL' })
    expect(result.resource_type).toBe('DIR_IMPL')
  })

  it('ES4 – accepts RECO resource type', () => {
    const result = searchSchema.parse({ query: 'test query', resource_type: 'RECO' })
    expect(result.resource_type).toBe('RECO')
  })
})

describe('enhanced buildSparqlQuery()', () => {
  it('ES5 – generates correct filter for REG_IMPL', () => {
    const client = new CellarClient()
    const sparql = client.buildSparqlQuery({
      query: 'test', resource_type: 'REG_IMPL', language: 'DEU', limit: 10,
    })
    expect(sparql).toContain('resource-type/REG_IMPL')
  })
})

describe('negative validation', () => {
  it('ES6a – rejects invalid type "REGULATION"', () => {
    expect(() => searchSchema.parse({ query: 'test', resource_type: 'REGULATION' })).toThrow()
  })

  it('ES6b – rejects invalid type "IMPL"', () => {
    expect(() => searchSchema.parse({ query: 'test', resource_type: 'IMPL' })).toThrow()
  })

  it('ES6c – rejects invalid type "directive"', () => {
    expect(() => searchSchema.parse({ query: 'test', resource_type: 'directive' })).toThrow()
  })
})
