import { z } from 'zod'
import { CELEX_REGEX } from '../constants.js'

export const metadataSchema = z.object({
  celex_id: z.string()
    .regex(CELEX_REGEX)
    .describe("CELEX-Identifier, z.B. '32024R1689' für den AI Act"),
  language: z.enum(["DEU", "ENG", "FRA"])
    .default("DEU")
    .describe("Sprache für Titel und EuroVoc-Labels"),
}).strict()

export type MetadataInput = z.infer<typeof metadataSchema>
