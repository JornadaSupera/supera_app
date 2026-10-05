import { describe, expect, it } from 'vitest';
import { Stethoscope } from 'lucide-react';
import {
  formatClosureDateLabel,
  parseClosureCelebrations,
  pickClosureToCelebrate,
} from './treatmentClosure';
import type { AppointmentStatusCode, EnrichedAppointment } from '../types';

const NOW = new Date('2026-10-05T12:00:00-03:00');

function closure(id: string, statusCode: AppointmentStatusCode = 'scheduled', isPast = false): EnrichedAppointment {
  const date = new Date('2026-10-16T14:00:00-03:00');
  return {
    id,
    title: 'Encerramento do tratamento',
    startsAt: date.toISOString(),
    endsAt: date.toISOString(),
    locationLabel: 'Supera',
    locationAddress: null,
    locationPhone: null,
    patientNotes: null,
    typeCode: 'treatment_closure',
    typeLabel: 'Encerramento de tratamento',
    typeColor: null,
    statusCode,
    statusLabel: '',
    isTerminal: statusCode !== 'scheduled',
    confirmedAt: null,
    confirmedByAccountId: null,
    specialty: null,
    date,
    time: '14:00',
    durationMin: 60,
    dateLabel: '',
    fullDateLabel: '',
    icon: Stethoscope,
    colorVar: '',
    isPast,
    canConfirm: true,
  };
}

describe('pickClosureToCelebrate', () => {
  it('abre para o encerramento agendado que nunca abriu', () => {
    expect(pickClosureToCelebrate([closure('a')], [], NOW)?.id).toBe('a');
  });

  it('não abre de novo para o mesmo compromisso', () => {
    const shownLongAgo = [{ appointmentId: 'a', shownAt: '2025-01-01T00:00:00Z' }];
    expect(pickClosureToCelebrate([closure('a')], shownLongAgo, NOW)).toBeNull();
  });

  it('cancelado, remarcado ou já passado não abre', () => {
    expect(pickClosureToCelebrate([closure('a', 'cancelled')], [], NOW)).toBeNull();
    expect(pickClosureToCelebrate([closure('a', 'rescheduled')], [], NOW)).toBeNull();
    expect(pickClosureToCelebrate([closure('a', 'scheduled', true)], [], NOW)).toBeNull();
  });

  it('remarcado vira compromisso novo, e a surpresa não volta', () => {
    const shownLastWeek = [{ appointmentId: 'old', shownAt: '2026-09-28T10:00:00Z' }];
    expect(pickClosureToCelebrate([closure('new')], shownLastWeek, NOW)).toBeNull();
  });

  it('passado o prazo, um encerramento novo abre de novo', () => {
    const shownLastYear = [{ appointmentId: 'old', shownAt: '2025-06-01T10:00:00Z' }];
    expect(pickClosureToCelebrate([closure('new')], shownLastYear, NOW)?.id).toBe('new');
  });
});

describe('parseClosureCelebrations', () => {
  it('lê o que foi gravado', () => {
    const raw = JSON.stringify([{ appointmentId: 'a', shownAt: '2026-10-05T12:00:00Z' }]);
    expect(parseClosureCelebrations(raw)).toEqual([{ appointmentId: 'a', shownAt: '2026-10-05T12:00:00Z' }]);
  });

  it('o que não estiver no formato vale como nunca mostrada', () => {
    expect(parseClosureCelebrations(null)).toEqual([]);
    expect(parseClosureCelebrations('não é json')).toEqual([]);
    expect(parseClosureCelebrations('{"a":1}')).toEqual([]);
    expect(parseClosureCelebrations('[{"appointmentId":1}]')).toEqual([]);
  });
});

describe('formatClosureDateLabel', () => {
  it('escreve como no modelo da clínica', () => {
    expect(formatClosureDateLabel(new Date(2026, 9, 16, 14, 0))).toBe('Sexta, 16 de outubro · 14h');
    expect(formatClosureDateLabel(new Date(2026, 9, 16, 9, 30))).toBe('Sexta, 16 de outubro · 9h30');
  });
});
