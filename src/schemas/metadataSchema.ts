import { z } from 'zod'

export const metadataSchema = z.object({
  celex_id: z.string()
    // {4,30} — supports parenthesized corrigenda suffixes, e.g. 32023D2454(02)
    .regex(/^\d[A-Z0-9()]{4,30}$/)
    .describe("CELEX-Identifier, z.B. '32024R1689' für den AI Act"),
  language: z.enum(["DEU", "ENG", "FRA"])
    .default("DEU")
    .describe("Sprache für Titel und EuroVoc-Labels"),
}).strict()

export type MetadataInput = z.infer<typeof metadataSchema>
