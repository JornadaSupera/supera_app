import { z } from 'zod';

// Schema do anexo de imagem do chat.
//
// Espelha exatamente o que o bucket `chat-attachments` aceita
// (`allowed_mime_types`/`file_size_limit` da migration) — validar aqui é
// falhar rápido e com mensagem legível, em vez de deixar o Storage recusar
// o upload depois que a mensagem e a linha do anexo já foram gravadas.

const TIPOS_ACEITOS = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** 20 MiB — mesmo teto do bucket `chat-attachments`. */
const TAMANHO_MAXIMO_BYTES = 20 * 1024 * 1024;

export const chatImageAttachmentSchema = z
  .instanceof(File, { message: 'Selecione um arquivo de imagem.' })
  .refine((file) => file.size > 0, { message: 'Este arquivo está vazio.' })
  .refine((file) => file.size <= TAMANHO_MAXIMO_BYTES, {
    message: 'A imagem precisa ter no máximo 20 MB.',
  })
  .refine((file) => TIPOS_ACEITOS.includes(file.type as (typeof TIPOS_ACEITOS)[number]), {
    message: 'Envie uma imagem em PNG, JPEG ou WEBP.',
  });
