import { z } from 'zod'

export const eurovocSchema = z.object({
  concept: z.string().min(2).max(500)
    .describe("EuroVoc-Konzept: Label (z.B. 'artificial intelligence') oder URI (z.B. 'http://eurovoc.europa.eu/4424')"),
  resource_type: z.enum(['REG', 'DIR', 'DEC', 'JUDG', 'any'])
    .default('any')
    .describe('Dokumenttyp-Filter'),
  language: z.enum(['DEU', 'ENG', 'FRA'])
    .default('DEU')
    .describe('Sprache für Titel und EuroVoc-Labels'),
  limit: z.number().int().min(1).max(50).default(10)
    .describe('Max. Ergebnisse'),
}).strict()

export type EurovocInput = z.infer<typeof eurovocSchema>
