import { z } from 'zod';

// Schemas do assistente de orientações e do pedido de orientação (guia do
// banco §5.5, ADR-033).

/** Abaixo disso a função recusa com `question_too_short`. */
export const QUESTION_MIN_CHARS = 3;

/**
 * Teto rígido da função (`HARD_MAX_QUESTION_CHARS`). O limite de verdade é o
 * da clínica (`ai_assistant_question_max_chars`, 100 a 2000).
 */
export const QUESTION_HARD_MAX_CHARS = 2000;

/** `request_content` exige o contexto entre 10 e 1000 caracteres. */
export const REQUEST_CONTEXT_MIN_CHARS = 10;
export const REQUEST_CONTEXT_MAX_CHARS = 1000;

// ------------------------------------------------------------------ resposta da Edge Function

const answeredReplySchema = z.object({
  status: z.literal('answered'),
  answer: z.string(),
  references: z.array(z.object({ content_item_id: z.string(), title: z.string() })),
  disclaimer: z.string(),
});

const noMatchReplySchema = z.object({
  status: z.literal('no_match'),
  message: z.string(),
  can_request: z.boolean(),
  suggested_context: z.string(),
});

/** O corpo 200 de `ask-content-assistant`. */
export const assistantReplySchema = z.discriminatedUnion('status', [answeredReplySchema, noMatchReplySchema]);

/** O corpo de erro das Edge Functions: `{ error: '<código>' }`. */
export const functionErrorBodySchema = z.object({ error: z.string().optional() });

// ------------------------------------------------------------------ formulários

/**
 * A pergunta. O teto vem da clínica, então o schema nasce com ele — a tela o
 * monta de novo quando o limite muda no painel.
 */
export function buildAssistantQuestionSchema(maxChars: number) {
  return z.object({
    question: z
      .string()
      .trim()
      .min(QUESTION_MIN_CHARS, 'Escreva um pouco mais sobre o que você quer saber.')
      .max(maxChars, `A pergunta pode ter no máximo ${maxChars} caracteres.`),
  });
}

export type AssistantQuestionFormValues = z.infer<ReturnType<typeof buildAssistantQuestionSchema>>;

/** O pedido de orientação: o rascunho da IA, que a pessoa revisa. */
export const contentRequestSchema = z.object({
  context: z
    .string()
    .trim()
    .min(REQUEST_CONTEXT_MIN_CHARS, 'Conte em poucas palavras sobre o que você quer a orientação.')
    .max(REQUEST_CONTEXT_MAX_CHARS, `O texto pode ter no máximo ${REQUEST_CONTEXT_MAX_CHARS} caracteres.`),
});

export type ContentRequestFormValues = z.infer<typeof contentRequestSchema>;
