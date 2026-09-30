import { describe, expect, it } from 'vitest';
import { formatBusinessHours, formatClockTime } from './businessHours';
import type { BusinessHoursInterval } from '../types';

const interval = (weekday: number, opensAt: string, closesAt: string): BusinessHoursInterval => ({
  weekday,
  opensAt,
  closesAt,
});

describe('formatClockTime', () => {
  it('omite os minutos redondos', () => {
    expect(formatClockTime('08:00:00')).toBe('08h');
    expect(formatClockTime('13:30:00')).toBe('13h30');
  });
});

describe('formatBusinessHours', () => {
  it('sem horário configurado, não inventa nenhum', () => {
    expect(formatBusinessHours([])).toBeNull();
  });

  it('junta dias seguidos com o mesmo horário numa faixa', () => {
    const weekdays = [1, 2, 3, 4, 5].map((day) => interval(day, '08:00:00', '18:00:00'));
    expect(formatBusinessHours(weekdays)).toBe('seg–sex, 08h–18h');
  });

  it('não junta dias com um dia fechado no meio', () => {
    const hours = [interval(1, '08:00:00', '12:00:00'), interval(3, '08:00:00', '12:00:00')];
    expect(formatBusinessHours(hours)).toBe('seg, 08h–12h; qua, 08h–12h');
  });

  it('lê a semana de segunda a domingo e ordena os intervalos do dia', () => {
    const hours = [
      interval(0, '09:00:00', '12:00:00'),
      interval(6, '13:30:00', '17:00:00'),
      interval(6, '08:00:00', '12:00:00'),
    ];
    expect(formatBusinessHours(hours)).toBe('sáb, 08h–12h e 13h30–17h; dom, 09h–12h');
  });
});
