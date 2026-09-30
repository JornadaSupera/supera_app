import { z } from 'zod';

const REQUIRED_SCORE_MESSAGE = 'Selecione uma nota de 0 a 10.';

/**
 * Teto do comentário.
 *
 * `nps_responses.comment` é `text` e o banco não limita o tamanho — o CHECK só
 * recusa string vazia. O teto é do app: sem ele, um toque longo numa colagem
 * manda um texto de qualquer tamanho para uma linha imutável, que ninguém
 * consegue corrigir depois (UPDATE e DELETE são recusados por trigger). 1000
 * caracteres cobrem com folga o que o campo pede.
 */
export const NPS_COMMENT_MAX_LENGTH = 1000;

/** Resposta da pesquisa de satisfação — nota obrigatória, comentário opcional. */
export const npsResponseSchema = z.object({
  score: z
    .number(REQUIRED_SCORE_MESSAGE)
    .int(REQUIRED_SCORE_MESSAGE)
    .min(0, REQUIRED_SCORE_MESSAGE)
    .max(10, REQUIRED_SCORE_MESSAGE),
  comment: z
    .string()
    .max(NPS_COMMENT_MAX_LENGTH, `O comentário pode ter no máximo ${NPS_COMMENT_MAX_LENGTH} caracteres.`)
    .optional(),
});

export type NpsResponseFormValues = z.infer<typeof npsResponseSchema>;
