import { Stethoscope } from 'lucide-react';
import { BY_SPECIALTY } from './appointments';
import type { CareTeamSpecialtyInfo } from '../types';

// Ícone e cor por especialidade — reusa `BY_SPECIALTY` de `utils/appointments.ts`
// (a Agenda já usa essa paleta). Não duplicar o mapa aqui: a mesma
// especialidade já apareceu com ícone/cor diferentes na Home e na Agenda
// quando este arquivo tinha sua própria cópia.

const FALLBACK_SPECIALTY_INFO: CareTeamSpecialtyInfo = {
  icon: Stethoscope,
  colorVar: 'var(--color-muted-foreground)',
};

/**
 * Apresentação de uma especialidade, com fallback neutro.
 *
 * `specialties` são só 7 linhas fixas e conhecidas, mas o fallback existe
 * pela mesma razão de `getAssuntoInfo`/`getTipoConteudoInfo`: uma linha nova
 * cadastrada no banco não deve fazer o app quebrar, só perder o ícone certo.
 */
export function getCareTeamSpecialtyInfo(code: string): CareTeamSpecialtyInfo {
  return BY_SPECIALTY[code] ?? FALLBACK_SPECIALTY_INFO;
}
