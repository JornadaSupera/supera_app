import { z } from 'zod';

// Validação do formulário de novo registro do Diário.

/** Limite do texto livre. Regra de produto — a coluna é `text`, sem teto. */
export const MAX_FREE_TEXT_LENGTH = 600;

/** Domínio 0–5, o mesmo do `CHECK (grade BETWEEN 0 AND 5)` da tabela. */
export const symptomIntensitySchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const symptomReportInputSchema = z.object({
  symptomId: z.string().min(1),
  grade: symptomIntensitySchema,
});

export const newEntrySchema = z
  .object({
    freeText: z.string().max(MAX_FREE_TEXT_LENGTH, `Máximo de ${MAX_FREE_TEXT_LENGTH} caracteres.`),
    symptoms: z.array(symptomReportInputSchema),
  })
  // Registro sem texto e sem nenhum sintoma é uma linha vazia no prontuário:
  // o banco aceitaria (as duas coisas são opcionais), mas não diz nada a
  // ninguém. É o que mantém o botão de salvar desabilitado até haver
  // conteúdo — papel que antes era da escolha obrigatória de humor.
  .refine(
    (data) => data.freeText.trim().length > 0 || data.symptoms.some((item) => item.grade > 0),
    {
      message: 'Escreva como você se sentiu ou marque ao menos um sintoma.',
      path: ['freeText'],
    }
  );

export type NewEntryFormValues = z.infer<typeof newEntrySchema>;
