import { describe, expect, it } from 'vitest';
import { CHAT_MESSAGE_MAX_LENGTH, chatImageAttachmentSchema, chatMessageSchema } from './chat';

describe('chatMessageSchema', () => {
  it('apara os espaços e recusa a mensagem vazia', () => {
    expect(chatMessageSchema.parse({ body: '  Olá  ' })).toEqual({ body: 'Olá' });
    expect(chatMessageSchema.safeParse({ body: '   ' }).success).toBe(false);
  });

  it('aceita até o teto e recusa acima dele', () => {
    expect(chatMessageSchema.safeParse({ body: 'a'.repeat(CHAT_MESSAGE_MAX_LENGTH) }).success).toBe(true);
    expect(chatMessageSchema.safeParse({ body: 'a'.repeat(CHAT_MESSAGE_MAX_LENGTH + 1) }).success).toBe(false);
  });
});

describe('chatImageAttachmentSchema', () => {
  const file = (type: string, size = 10) => new File([new Uint8Array(size)], 'foto', { type });

  it('aceita PNG, JPEG e WEBP', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(chatImageAttachmentSchema.safeParse(file(type)).success).toBe(true);
    }
  });

  it('recusa PDF, arquivo vazio e o que não é arquivo', () => {
    expect(chatImageAttachmentSchema.safeParse(file('application/pdf')).success).toBe(false);
    expect(chatImageAttachmentSchema.safeParse(file('image/png', 0)).success).toBe(false);
    expect(chatImageAttachmentSchema.safeParse('foto.png').success).toBe(false);
  });
});
