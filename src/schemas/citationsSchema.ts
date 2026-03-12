import { z } from 'zod';

import { CELEX_REGEX } from '../constants.js';

export const citationsSchema = z
  .object({
    celex_id: z.string().regex(CELEX_REGEX).describe("CELEX-Identifier, z.B. '32024R1689'"),
    language: z.enum(['DEU', 'ENG', 'FRA']).default('DEU').describe('Sprache für Titel'),
    direction: z
      .enum(['cites', 'cited_by', 'both'])
      .default('both')
      .describe(
        'Richtung: cites=zitiert von diesem Dokument, cited_by=zitiert dieses Dokument, both=beides',
      ),
    limit: z.number().int().min(1).max(100).default(20).describe('Max. Ergebnisse'),
  })
  .strict();

export type CitationsInput = z.infer<typeof citationsSchema>;
