import { describe, expect, it } from 'vitest';
import { ageInYears, latestBirthDateForAge } from './date';

describe('latestBirthDateForAge', () => {
  it('volta a mesma data, N anos atrás', () => {
    expect(latestBirthDateForAge(18, '2026-10-05')).toBe('2008-10-05');
  });

  it('quem nasceu no limite já tem a idade; um dia depois, ainda não', () => {
    const limit = latestBirthDateForAge(18, '2026-10-05');
    expect(ageInYears(limit, '2026-10-05')).toBe(18);
    expect(ageInYears('2008-10-06', '2026-10-05')).toBe(17);
  });

  it('29 de fevereiro vira 28 em ano que não é bissexto', () => {
    expect(latestBirthDateForAge(18, '2028-02-29')).toBe('2010-02-28');
    expect(ageInYears('2010-02-28', '2028-02-29')).toBe(18);
  });

  it('29 de fevereiro continua 29 em ano bissexto', () => {
    expect(latestBirthDateForAge(4, '2028-02-29')).toBe('2024-02-29');
  });
});
