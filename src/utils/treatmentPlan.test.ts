import { describe, expect, it } from 'vitest';
import { formatTreatmentCycles } from './treatmentPlan';

describe('formatTreatmentCycles', () => {
  it('mostra o ciclo em andamento e o total quando há os dois', () => {
    expect(formatTreatmentCycles(3, 6)).toBe('Ciclo 3 de 6');
  });

  it('só com o total, diz quantos ciclos estão previstos', () => {
    expect(formatTreatmentCycles(null, 6)).toBe('6 ciclos previstos');
    expect(formatTreatmentCycles(null, 1)).toBe('1 ciclo previsto');
  });

  it('só com o ciclo em andamento, mostra o ciclo', () => {
    expect(formatTreatmentCycles(2, null)).toBe('Ciclo 2');
  });

  it('sem nenhum dos dois (ou com zero), não mostra nada', () => {
    expect(formatTreatmentCycles(null, null)).toBeNull();
    expect(formatTreatmentCycles(0, 0)).toBeNull();
  });
});
