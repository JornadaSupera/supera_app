import {
  Apple,
  Bone,
  Brain,
  Calendar,
  ClipboardList,
  FlaskConical,
  HeartPulse,
  Pill,
  Stethoscope,
  Syringe,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Apresentação do compromisso: qual ícone e qual cor.
//
// O banco tem `appointment_types.color` e `.icon_name`, mas os dois nascem
// NULL — o comentário da própria coluna diz "NULL até a clínica definir".
// Enquanto for assim, a paleta é daqui; quando a clínica preencher a cor, ela
// passa a valer sem mexer neste arquivo (ver `resolveAppointmentVisual`).
//
// Duas chaves compõem o resultado, porque nenhuma sozinha basta:
//
// - `appointment_types.code` é NOT NULL e diz a MODALIDADE (infusão, exame,
//   retirada). Para essas, a modalidade é o que o paciente reconhece na tela.
// - `specialties.code` (via `appointments.origin_specialty_id`) diz a ÁREA, e
//   só ela distingue uma consulta de nutrição de uma de psicologia. É opcional
//   no banco, então nunca pode ser a única fonte.
//
// A regra: a especialidade refina apenas os tipos genéricos de consulta. Numa
// infusão, o ícone de seringa diz mais do que "Enfermagem".

export interface AppointmentVisual {
  icon: LucideIcon;
  colorVar: string;
}

const FALLBACK: AppointmentVisual = {
  icon: ClipboardList,
  colorVar: 'var(--color-foreground)',
};

/** Tipos cuja identidade visual vem da especialidade, quando houver uma. */
const GENERIC_TYPE_CODES = new Set(['medical_consultation', 'follow_up', 'multidisciplinary']);

const BY_TYPE: Record<string, AppointmentVisual> = {
  infusion: { icon: Syringe, colorVar: 'var(--color-primary)' },
  lab_exam: { icon: FlaskConical, colorVar: 'var(--color-supera-uniao)' },
  medication_pickup: { icon: Pill, colorVar: 'var(--color-supera-perfeicao)' },
  procedure: { icon: Syringe, colorVar: 'var(--color-supera-uniao)' },
  medical_consultation: { icon: Stethoscope, colorVar: 'var(--color-foreground)' },
  follow_up: { icon: Stethoscope, colorVar: 'var(--color-supera-empatia)' },
  multidisciplinary: { icon: ClipboardList, colorVar: 'var(--color-supera-empatia)' },
};

// Exportado: é a única fonte de ícone/cor por especialidade do app — também
// usada pelo card "Sua equipe" da Home (`utils/careTeam.ts`). Duas cópias
// divergentes já causaram a mesma especialidade aparecer com ícone/cor
// diferentes em duas telas; não duplicar de novo.
export const BY_SPECIALTY: Record<string, AppointmentVisual> = {
  oncology: { icon: Stethoscope, colorVar: 'var(--color-primary)' },
  pharmacy: { icon: Pill, colorVar: 'var(--color-supera-perfeicao)' },
  nursing: { icon: HeartPulse, colorVar: 'var(--color-supera-amor)' },
  nutrition: { icon: Apple, colorVar: 'var(--color-mood-1)' },
  psychology: { icon: Brain, colorVar: 'var(--color-supera-empatia)' },
  dentistry: { icon: Calendar, colorVar: 'var(--color-foreground)' },
  physiotherapy: { icon: Bone, colorVar: 'var(--color-supera-amor)' },
};

/**
 * Ícone e cor de um compromisso.
 *
 * `dbColor` é `appointment_types.color`: quando a clínica finalmente definir
 * as cores, o valor do banco prevalece sobre a paleta local — que é o
 * comportamento que a coluna sempre pretendeu ter. O ícone continua vindo
 * daqui mesmo assim: `icon_name` guardaria um nome em texto, e resolver texto
 * para componente exigiria um registro de ícones que não se paga enquanto a
 * coluna estiver vazia.
 */
export function resolveAppointmentVisual(
  typeCode: string,
  specialtyCode: string | null,
  dbColor: string | null = null
): AppointmentVisual {
  const porEspecialidade =
    specialtyCode && GENERIC_TYPE_CODES.has(typeCode) ? BY_SPECIALTY[specialtyCode] : undefined;

  const base = porEspecialidade ?? BY_TYPE[typeCode] ?? FALLBACK;

  return dbColor ? { ...base, colorVar: dbColor } : base;
}
