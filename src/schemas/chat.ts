import { z } from 'zod';

// Schema do chat: o texto da dúvida que vai para o WhatsApp da enfermagem.

/**
 * Teto do texto de uma mensagem.
 *
 * `messages.body` é `text` e o banco só recusa o vazio (CHECK de `btrim`). O
 * teto é do app, como o do comentário do NPS: a mensagem é imutável, e uma
 * colagem acidental de qualquer tamanho ficaria para sempre na conversa. 2000
 * caracteres cobrem com folga um relato de sintomas.
 */
export const CHAT_MESSAGE_MAX_LENGTH = 2000;

/** Texto da dúvida, no "Falar com a enfermagem". */
export const chatMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Escreva a mensagem.')
    .max(
      CHAT_MESSAGE_MAX_LENGTH,
      `A mensagem pode ter no máximo ${CHAT_MESSAGE_MAX_LENGTH} caracteres.`
    ),
});

export type ChatMessageFormValues = z.infer<typeof chatMessageSchema>;
