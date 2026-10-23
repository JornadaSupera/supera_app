import { describe, expect, it } from 'vitest';
import { CHAT_MESSAGE_MAX_LENGTH, chatMessageSchema } from './chat';

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
