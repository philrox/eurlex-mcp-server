import { describe, it, expect } from 'vitest'
import { consolidatedSchema } from '../src/schemas/consolidatedSchema.js'

describe('consolidatedSchema', () => {
  it('CO1 – accepts type/year/number with defaults', () => {
    const result = consolidatedSchema.parse({ doc_type: 'reg', year: 2024, number: 1689 })
    expect(result.language).toBe('DEU')
    expect(result.format).toBe('xhtml')
  })

  it('CO2 – accepts dir type', () => {
    const result = consolidatedSchema.parse({ doc_type: 'dir', year: 2022, number: 2555 })
    expect(result.doc_type).toBe('dir')
  })

  it('CO3 – rejects year below 1950', () => {
    expect(() => consolidatedSchema.parse({ doc_type: 'reg', year: 1900, number: 1 })).toThrow()
  })
})
