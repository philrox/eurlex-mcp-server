import { z } from 'zod'

export const searchSchema = z.object({
  query: z.string().min(3).max(500)
    .describe("Suchbegriff, z.B. 'artificial intelligence high risk'"),
  resource_type: z.enum(["REG", "DIR", "DEC", "JUDG", "any"])
    .default("any")
    .describe("Dokumenttyp: REG=Verordnung, DIR=Richtlinie, DEC=Entscheidung, JUDG=Urteil"),
  language: z.enum(["DEU", "ENG", "FRA"])
    .default("DEU")
    .describe("Sprache für Titel und Volltext"),
  limit: z.number().int().min(1).max(50).default(10)
    .describe("Max. Ergebnisse"),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe("Filter ab Datum, Format: YYYY-MM-DD"),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe("Filter bis Datum, Format: YYYY-MM-DD"),
}).strict()

export type SearchInput = z.infer<typeof searchSchema>
