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
import type { AppointmentStatusCode } from '../types';

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
//
// A COR DO TIPO é outra coisa e é uma só por tipo (`resolveAppointmentTypeColor`):
// é a cor da legenda e do marcador da visão mensal, e por isso os sete tipos
// têm cores diferentes entre si — com a legenda repetindo verde três vezes, o
// marcador não dizia qual compromisso havia no dia.

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

// Só tokens que já existem (nada de hex solto), um por tipo e de tons bem
// afastados. As cores oficiais continuam com a clínica: quando ela preencher
// `appointment_types.color`, o valor do banco vale no lugar destas.
const BY_TYPE: Record<string, AppointmentVisual> = {
  infusion: { icon: Syringe, colorVar: 'var(--color-primary)' },
  lab_exam: { icon: FlaskConical, colorVar: 'var(--color-infusion-waiting)' },
  medication_pickup: { icon: Pill, colorVar: 'var(--color-infusion-prep)' },
  procedure: { icon: Syringe, colorVar: 'var(--color-supera-amor)' },
  medical_consultation: { icon: Stethoscope, colorVar: 'var(--color-foreground)' },
  follow_up: { icon: Stethoscope, colorVar: 'var(--color-mood-1)' },
  multidisciplinary: { icon: ClipboardList, colorVar: 'var(--color-infusion-done)' },
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

/**
 * A cor do TIPO de compromisso: a do banco quando a clínica a definiu, senão a
 * da paleta local. Legenda e marcadores do mês leem daqui, e só daqui — é o que
 * garante que a bolinha do dia tenha a cor que a legenda promete.
 */
export function resolveAppointmentTypeColor(typeCode: string, dbColor: string | null = null): string {
  return dbColor ?? (BY_TYPE[typeCode] ?? FALLBACK).colorVar;
}

/**
 * Quem confirmou a presença, dito da posição de quem está lendo. Só o titular
 * e quem o acompanha confirmam (a RPC recusa qualquer outra conta). Na sessão
 * do titular, outra conta é sempre "quem acompanha você". Na do acompanhante
 * não dá para dizer "o paciente": o app não tem a conta dele para comparar, e
 * pode ter sido outro acompanhante. Sem saber quem foi (linha antiga, sessão
 * ainda sem conta), a frase não afirma nada além do fato.
 */
export function describeConfirmer(
  confirmedByAccountId: string | null,
  sessionAccountId: string | null,
  isCaregiver: boolean
): string {
  if (!confirmedByAccountId || !sessionAccountId) return 'Presença confirmada';
  if (confirmedByAccountId === sessionAccountId) return 'Confirmada por você';
  return isCaregiver ? 'Confirmada por outra pessoa' : 'Confirmada por quem acompanha você';
}

/**
 * Nome de um dia da grade do mês para leitor de tela. A bolinha colorida não
 * diz nada a quem não a vê, então o botão do dia leva a data e a contagem.
 */
export function describeAgendaDay(date: Date, appointmentCount: number, isToday: boolean): string {
  const dayLabel = date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  const whenLabel = isToday ? `${dayLabel}, hoje` : dayLabel;

  if (appointmentCount === 0) return `${whenLabel}, sem compromissos`;

  return `${whenLabel}, ${appointmentCount} ${appointmentCount === 1 ? 'compromisso' : 'compromissos'}`;
}

/**
 * O compromisso não vai acontecer: foi cancelado, ou é a linha antiga de um
 * remarcado (o banco cria outra linha para o horário novo e encerra esta).
 * Nas visões de calendário os dois precisam aparecer riscados — mostrá-los
 * como qualquer outro faria o paciente ir a uma consulta que não existe mais.
 */
export function isCalledOff(statusCode: AppointmentStatusCode): boolean {
  return statusCode === 'cancelled' || statusCode === 'rescheduled';
}

/**
 * Recorte por tipo de compromisso, só de exibição: roda sobre o que a RLS já
 * entregou e não substitui filtro do banco.
 */
export function filterByType<T extends { typeCode: string }>(
  compromissos: T[],
  typeCode: string | null
): T[] {
  if (!typeCode) return compromissos;
  return compromissos.filter((compromisso) => compromisso.typeCode === typeCode);
}
