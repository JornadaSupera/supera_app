import { describe, expect, it } from 'vitest';
import { canDownloadExport, isExportWindowClosed } from './dataSubject';
import type { DataSubjectRequest } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-02T12:00:00Z');

function request(overrides: Partial<DataSubjectRequest>): DataSubjectRequest {
  return {
    id: 'pedido',
    type: 'portability',
    status: 'granted',
    decisionNote: null,
    createdAt: new Date(NOW - 30 * DAY_MS).toISOString(),
    decidedAt: new Date(NOW - 20 * DAY_MS).toISOString(),
    executedAt: null,
    ...overrides,
  };
}

describe('isExportWindowClosed', () => {
  it('fecha o pacote deferido há mais de 15 dias, baixado ou não', () => {
    expect(isExportWindowClosed(request({}), NOW)).toBe(true);
    expect(isExportWindowClosed(request({ status: 'executed' }), NOW)).toBe(true);
    expect(isExportWindowClosed(request({ type: 'access' }), NOW)).toBe(true);
  });

  it('não fecha dentro do prazo, e nunca é o mesmo dia do botão de baixar', () => {
    const recent = request({ decidedAt: new Date(NOW - 3 * DAY_MS).toISOString() });
    expect(isExportWindowClosed(recent, NOW)).toBe(false);
    expect(canDownloadExport(recent, NOW)).toBe(true);
    expect(canDownloadExport(request({}), NOW)).toBe(false);
  });

  it('não vale para outros tipos nem para pedido sem decisão ou recusado', () => {
    expect(isExportWindowClosed(request({ type: 'deletion' }), NOW)).toBe(false);
    expect(isExportWindowClosed(request({ status: 'requested', decidedAt: null }), NOW)).toBe(false);
    expect(isExportWindowClosed(request({ status: 'refused' }), NOW)).toBe(false);
  });
});
