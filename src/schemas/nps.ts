import { z } from 'zod';

const REQUIRED_SCORE_MESSAGE = 'Selecione uma nota de 0 a 10.';

/** Resposta da pesquisa de satisfação — nota obrigatória, comentário opcional. */
export const npsResponseSchema = z.object({
  score: z
    .number(REQUIRED_SCORE_MESSAGE)
    .int(REQUIRED_SCORE_MESSAGE)
    .min(0, REQUIRED_SCORE_MESSAGE)
    .max(10, REQUIRED_SCORE_MESSAGE),
  comment: z.string().optional(),
});

export type NpsResponseFormValues = z.infer<typeof npsResponseSchema>;
