import { describe, expect, it } from 'vitest';
import { UPDATE_SNOOZE_HOURS, isUpdateSnoozed, parseSnooze, snoozeUntil } from './appUpdate';

const HOUR = 60 * 60 * 1000;

describe('adiamento da atualização', () => {
  const now = Date.UTC(2026, 9, 2, 12);

  it(`segura a tela por ${UPDATE_SNOOZE_HOURS} horas para a mesma versão`, () => {
    const snooze = snoozeUntil('1.2.0', now);

    expect(isUpdateSnoozed(snooze, '1.2.0', now + HOUR)).toBe(true);
    expect(isUpdateSnoozed(snooze, '1.2.0', now + UPDATE_SNOOZE_HOURS * HOUR - 1)).toBe(true);
    expect(isUpdateSnoozed(snooze, '1.2.0', now + UPDATE_SNOOZE_HOURS * HOUR)).toBe(false);
  });

  it('não segura a tela de uma versão mais nova', () => {
    expect(isUpdateSnoozed(snoozeUntil('1.2.0', now), '1.3.0', now + HOUR)).toBe(false);
  });

  it('sem adiamento, a tela aparece', () => {
    expect(isUpdateSnoozed(null, '1.2.0', now)).toBe(false);
  });
});

describe('parseSnooze', () => {
  it('lê o adiamento gravado', () => {
    expect(parseSnooze(JSON.stringify({ version: '12', until: 100 }))).toEqual({ version: '12', until: 100 });
  });

  it('descarta o que não tiver o formato', () => {
    expect(parseSnooze(null)).toBeNull();
    expect(parseSnooze('não é json')).toBeNull();
    expect(parseSnooze('null')).toBeNull();
    expect(parseSnooze(JSON.stringify({ version: 12, until: 100 }))).toBeNull();
    expect(parseSnooze(JSON.stringify({ version: '12' }))).toBeNull();
  });
});
