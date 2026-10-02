import { z } from 'zod';
import { RECTIFICATION_DESCRIPTION_MAX_LENGTH, RECTIFICATION_FIELDS } from '../utils/dataSubject';

// Schemas dos direitos do titular (guia do banco §5.19).

/**
 * Pedido de correção: quais dados estão errados e como devem ficar.
 *
 * Os dois são obrigatórios. Sem eles o pedido chega ao painel sem dizer o que
 * corrigir, e a equipe precisa ligar para perguntar — o que o formulário
 * existe para evitar.
 */
export const rectificationRequestSchema = z.object({
  fields: z.array(z.enum(RECTIFICATION_FIELDS)).min(1, 'Marque pelo menos um dado.'),
  description: z
    .string()
    .trim()
    .min(10, 'Conte o que está errado e como deve ficar.')
    .max(
      RECTIFICATION_DESCRIPTION_MAX_LENGTH,
      `O texto pode ter no máximo ${RECTIFICATION_DESCRIPTION_MAX_LENGTH} caracteres.`
    ),
});

export type RectificationRequestFormValues = z.infer<typeof rectificationRequestSchema>;
