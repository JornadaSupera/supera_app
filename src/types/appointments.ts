// Tipos do domínio Agenda — espelham `appointments` e os catálogos
// `appointment_types`, `appointment_statuses` e `specialties`.
//
// Duas ausências do banco moldam estes tipos:
//
// - Não há nome de profissional legível pelo paciente. `professionals` não tem
//   coluna de nome, e `accounts.full_name` é visível só ao próprio dono. O que
//   a tela mostra é a ÁREA que atende ("com a equipe de Oncologia"), derivada
//   de `specialties`, que o paciente pode ler.
// - Não há descritor de categoria por compromisso. O sobretítulo da tela de
//   detalhe passa a ser `appointment_types.label` — que é como o autor do
//   esquema modelou o chip de tipo do protótipo.

import type { LucideIcon } from 'lucide-react';

/** `appointment_statuses.code`. Semeados: os cinco abaixo. */
export type AppointmentStatusCode =
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';

/**
 * Item do catálogo de tipos. `code` é estável e é por onde se filtra;
 * `label` é o que se renderiza (o seed vem acentuado).
 */
export interface AppointmentTypeInfo {
  id: string;
  code: string;
  label: string;
  sortOrder: number;
  /** `appointment_types.color` — NULL até a clínica definir. */
  color: string | null;
}

/** Especialidade, quando o compromisso está roteado para uma. */
export interface AppointmentSpecialty {
  code: string;
  label: string;
}

/** Compromisso como o banco o devolve, já com os catálogos resolvidos. */
export interface Appointment {
  id: string;
  title: string;
  /** ISO 8601 com offset. */
  startsAt: string;
  endsAt: string;
  locationLabel: string;
  locationAddress: string | null;
  locationPhone: string | null;
  /** Texto destinado ao paciente. Conteúdo clínico nunca vem por aqui. */
  patientNotes: string | null;
  typeCode: string;
  /** Sobretítulo da tela de detalhe. */
  typeLabel: string;
  typeColor: string | null;
  statusCode: AppointmentStatusCode;
  statusLabel: string;
  /** Estado terminal não transiciona mais — some o botão de remarcar. */
  isTerminal: boolean;
  /** ISO 8601, ou `null` quando o paciente ainda não confirmou presença. */
  confirmedAt: string | null;
  /**
   * Área que atende. Vem de `origin_specialty_id` e, na falta dele, da
   * especialidade do profissional designado.
   */
  specialty: AppointmentSpecialty | null;
}

/** Compromisso com os campos derivados que as telas consomem. */
export interface EnrichedAppointment extends Appointment {
  date: Date;
  /** `HH:MM` de início, no fuso da clínica. */
  time: string;
  durationMin: number;
  /** Rótulo relativo ("Amanhã · 08:30", "Há 3 dias"). */
  dateLabel: string;
  /** Data por extenso com dia da semana. */
  fullDateLabel: string;
  icon: LucideIcon;
  colorVar: string;
  isPast: boolean;
  /**
   * O paciente pode confirmar presença: só antes do início e só enquanto
   * `scheduled` — as mesmas condições que a RPC impõe do lado do banco.
   */
  canConfirm: boolean;
}

/** Um dia das visões Semanal e Mensal. */
export interface AgendaDay {
  date: Date;
  events: EnrichedAppointment[];
}

/** Resumo do próximo compromisso, para o card da Home. */
export interface NextAppointmentSummary {
  id: string;
  title: string;
  date: Date;
  dayLabel: string;
  time: string;
  locationLabel: string;
  /** Rótulo da área que atende, quando houver. */
  specialtyLabel: string | null;
  icon: LucideIcon;
  colorVar: string;
  /** = `patientNotes`; `null` quando não há. */
  tip: string | null;
}

/** Intervalo fechado para as consultas por período. */
export interface AppointmentRange {
  /** ISO 8601. */
  from: string;
  to: string;
}
