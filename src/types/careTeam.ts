// Tipos da equipe de cuidado (Home) — quais ESPECIALIDADES atendem o
// paciente, não quais PESSOAS.
//
// Não existe "profissional responsável" no banco: não há tabela de
// atribuição paciente↔profissional, e mesmo que houvesse, nome de
// profissional não é legível pelo paciente (`accounts_select_own` limita à
// própria linha — mesma parede já documentada em `types/messages.ts` para o
// Chat e em `types/caregiver.ts` para o Cuidador).
//
// O sinal real e honesto é a especialidade de cada compromisso do paciente
// — resolvida com o mesmo fallback que a Agenda já usa (`resolveSpecialty`
// em `mockApi.ts`): a especialidade do roteamento do compromisso quando
// existe, senão a do profissional designado. Por isso a forma da
// especialidade aqui é a mesma que a Agenda já usa (`AppointmentSpecialty`),
// não um tipo paralelo.

import type { LucideIcon } from 'lucide-react';
import type { AppointmentSpecialty } from './appointments';

/** Ícone e cor de uma especialidade — sem coluna no banco, mapeado no cliente. */
export interface CareTeamSpecialtyInfo {
  icon: LucideIcon;
  colorVar: string;
}

/** Especialidade do catálogo já casada com a sua apresentação. */
export interface CareTeamSpecialtyOption extends AppointmentSpecialty {
  info: CareTeamSpecialtyInfo;
}

/** Retorno de `getCareTeamSummary`. */
export interface CareTeamSummary {
  specialties: CareTeamSpecialtyOption[];
}
