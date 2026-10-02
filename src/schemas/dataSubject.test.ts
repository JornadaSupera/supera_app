import { describe, expect, it } from 'vitest';
import { rectificationRequestSchema } from './dataSubject';
import { buildRectificationNote } from '../utils/dataSubject';

describe('rectificationRequestSchema', () => {
  it('aceita dados marcados e um texto que diz como deve ficar', () => {
    const result = rectificationRequestSchema.parse({
      fields: ['phone'],
      description: '  Meu celular mudou para outro número.  ',
    });
    expect(result.description).toBe('Meu celular mudou para outro número.');
  });

  it('pede pelo menos um dado e um texto com conteúdo', () => {
    const result = rectificationRequestSchema.safeParse({ fields: [], description: 'curto' });
    expect(result.success).toBe(false);
    const messages = result.success ? [] : result.error.issues.map((issue) => issue.message);
    expect(messages).toContain('Marque pelo menos um dado.');
    expect(messages).toContain('Conte o que está errado e como deve ficar.');
  });

  it('recusa um dado fora da lista e um texto longo demais', () => {
    expect(rectificationRequestSchema.safeParse({ fields: ['address'], description: 'x'.repeat(20) }).success).toBe(
      false
    );
    expect(rectificationRequestSchema.safeParse({ fields: ['cpf'], description: 'x'.repeat(801) }).success).toBe(false);
  });
});

describe('buildRectificationNote', () => {
  it('lista os dados na ordem do formulário, antes do texto', () => {
    expect(buildRectificationNote(['email', 'full_name'], ' O sobrenome está errado. ')).toBe(
      'Dados a corrigir: Nome, E-mail.\n\nO sobrenome está errado.'
    );
  });

  it('cabe no limite do banco mesmo com todos os dados e o texto no teto', () => {
    const note = buildRectificationNote(
      ['full_name', 'cpf', 'birth_date', 'phone', 'email', 'other'],
      'x'.repeat(800)
    );
    expect(note.length).toBeLessThanOrEqual(1000);
  });
});
