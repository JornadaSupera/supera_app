import { z } from 'zod';

// Schemas do chat: o texto da mensagem e o anexo de imagem.
//
// O do anexo espelha exatamente o que o bucket `chat-attachments` aceita
// (`allowed_mime_types`/`file_size_limit` da migration) — validar aqui é
// falhar rápido e com mensagem legível, em vez de deixar o Storage recusar
// o upload depois que a mensagem e a linha do anexo já foram gravadas.

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** 20 MiB — mesmo teto do bucket `chat-attachments`. */
const MAX_SIZE_BYTES = 20 * 1024 * 1024;

/**
 * Teto do texto de uma mensagem.
 *
 * `messages.body` é `text` e o banco só recusa o vazio (CHECK de `btrim`). O
 * teto é do app, como o do comentário do NPS: a mensagem é imutável, e uma
 * colagem acidental de qualquer tamanho ficaria para sempre na conversa. 2000
 * caracteres cobrem com folga um relato de sintomas.
 */
export const CHAT_MESSAGE_MAX_LENGTH = 2000;

/** Texto de uma mensagem — da conversa aberta e da primeira, ao abrir uma nova. */
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

export const chatImageAttachmentSchema = z
  .instanceof(File, { message: 'Selecione um arquivo de imagem.' })
  .refine((file) => file.size > 0, { message: 'Este arquivo está vazio.' })
  .refine((file) => file.size <= MAX_SIZE_BYTES, {
    message: 'A imagem precisa ter no máximo 20 MB.',
  })
  .refine((file) => ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number]), {
    message: 'Envie uma imagem em PNG, JPEG ou WEBP.',
  });
