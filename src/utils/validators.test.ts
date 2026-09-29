import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCPF, formatPhone, unmask } from './masks';
import { isValidBirthDate, isValidCPF } from './validators';

describe('máscaras', () => {
  it('unmask deixa só os dígitos', () => {
    expect(unmask('(49) 99999-8888')).toBe('49999998888');
    expect(unmask(null)).toBe('');
    expect(unmask(123)).toBe('123');
  });

  it('formatCPF monta a máscara enquanto se digita', () => {
    expect(formatCPF('123')).toBe('123');
    expect(formatCPF('1234')).toBe('123.4');
    expect(formatCPF('1234567')).toBe('123.456.7');
    expect(formatCPF('12345678901')).toBe('123.456.789-01');
    expect(formatCPF('123456789012345')).toBe('123.456.789-01');
  });

  it('formatPhone aceita fixo e celular', () => {
    expect(formatPhone('')).toBe('');
    expect(formatPhone('49')).toBe('(49');
    expect(formatPhone('4999')).toBe('(49) 99');
    expect(formatPhone('4933239836')).toBe('(49) 3323-9836');
    expect(formatPhone('49999998888')).toBe('(49) 99999-8888');
  });
});

describe('isValidCPF', () => {
  it('aceita CPF com os dígitos verificadores certos, com ou sem máscara', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true);
    expect(isValidCPF('52998224725')).toBe(true);
  });

  it('recusa dígito verificador errado, tamanho errado e dígitos repetidos', () => {
    expect(isValidCPF('529.982.247-24')).toBe(false);
    expect(isValidCPF('5299822472')).toBe(false);
    expect(isValidCPF('111.111.111-11')).toBe(false);
    expect(isValidCPF(null)).toBe(false);
  });
});

describe('isValidBirthDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 12, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aceita uma data real no passado', () => {
    expect(isValidBirthDate('1980-05-17')).toBe(true);
    expect(isValidBirthDate('2026-09-29')).toBe(true);
  });

  it('recusa data inexistente, futura, com mais de 120 anos ou fora do formato', () => {
    expect(isValidBirthDate('2024-02-30')).toBe(false);
    expect(isValidBirthDate('2026-09-30')).toBe(false);
    expect(isValidBirthDate('1900-01-01')).toBe(false);
    expect(isValidBirthDate('17/05/1980')).toBe(false);
    expect(isValidBirthDate(undefined)).toBe(false);
  });
});
