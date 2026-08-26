// Tipos do domínio Agenda — cobre o mock em `src/mocks/appointments.js` e os
// formatos "enriquecidos" que `getProximosCompromissos`, `getSemanaAgenda`,
// `getMesAgenda` etc. (src/services/mockApi.js) montam em cima dele.
//
// `AppointmentCategory` e `AppointmentType` espelham as chaves fixas dos
// objetos `CATEGORIAS`/`TIPOS` em `src/utils/agenda.js` — um enum fechado de
// verdade (uma categoria fora dessa lista cai no fallback
// `CATEGORIAS.consulta`). Isso é diferente de `Orientation.categoria`
// (orientations.ts), que é texto livre porque não existe lookup nenhum
// validando aquele campo — ver o comentário lá.

import type { LucideIcon } from 'lucide-react';

/**
 * As 8 categorias existentes no mock — mesmas chaves de `CATEGORIAS` em
 * `src/utils/agenda.js` (conferido 1 a 1: as 18 entradas de
 * `appointments.js` só usam estes 8 valores).
 */
export type AppointmentCategory =
  | 'quimioterapia'
  | 'nutricao'
  | 'exame'
  | 'psicologia'
  | 'farmacia'
  | 'consulta'
  | 'fisioterapia'
  | 'odontologia';

/**
 * Tipo "macro" do compromisso. Não existe no mock cru — é derivado de
 * `CATEGORIAS[categoria].tipo` por `enrichAppointment` (mockApi.js), a
 * partir das 4 chaves de `TIPOS` em `src/utils/agenda.js`.
 */
export type AppointmentType = 'infusao' | 'consulta' | 'exame' | 'retirada';

/**
 * Só 2 valores não nulos aparecem no mock, e são os únicos comparados no
 * código (`AppointmentListItem.jsx`: `status === 'confirmado'`;
 * `AppointmentDetail.jsx`: `status === 'realizado'`) — não existe
 * 'cancelado' nem qualquer outro valor em lugar nenhum do app.
 */
export type AppointmentStatus = 'confirmado' | 'realizado';

/**
 * Forma do profissional dentro de um Appointment cru — sem `foto` (diferente
 * de `CareTeamMember`, em messages.ts, que tem `foto`). São estruturas
 * parecidas mas não idênticas nos dados reais, por isso não foram
 * unificadas numa só interface.
 */
export interface AppointmentProfessional {
  nome: string;
  cargo: string;
}

/**
 * Compromisso da Agenda, como armazenado em `src/mocks/appointments.js`
 * (18 registros conferidos). `profissional`, `status` e `observacoes` são
 * sempre chaves presentes — nenhum dos 18 registros omite a chave, só o
 * valor varia entre objeto/string e `null`. Por isso nenhum dos três é
 * opcional (`?`): são nuláveis, não ausentes.
 */
export interface Appointment {
  id: string;
  categoria: AppointmentCategory;
  /** Texto livre — varia mesmo dentro da mesma categoria, não é enum (ex.: 'exame' tem 'Exame' e 'Exame de imagem'). */
  descricaoCategoria: string;
  titulo: string;
  /**
   * Deslocamento em dias a partir de hoje (0 = hoje, negativo = passado,
   * positivo = futuro). Mecanismo só do mock, pra a agenda continuar
   * "atual" não importa quando o app rodar — deve virar uma data ISO real
   * quando o backend existir.
   */
  diasAPartirDeHoje: number;
  /** Formato 'HH:MM' (24h). */
  hora: string;
  duracaoMin: number;
  local: string;
  profissional: AppointmentProfessional | null;
  status: AppointmentStatus | null;
  observacoes: string | null;
}

/**
 * Appointment depois de `enrichAppointment` (mockApi.js) — retorno de
 * `getProximosCompromissos`, `getHistoricoCompromissos`,
 * `getCompromissoPorId`, e o formato de cada item em `AgendaDay.eventos`.
 */
export interface EnrichedAppointment extends Appointment {
  data: Date;
  dataLabel: string;
  dataCompletaLabel: string;
  icon: LucideIcon;
  colorVar: string;
  /** Campo novo, não existe em `Appointment` cru — ver `AppointmentType`. */
  tipo: AppointmentType;
}

/**
 * Um dia da visão Semanal/Mensal da Agenda. Retorno de `getSemanaAgenda`
 * (sempre 7 itens, um por dia da semana) e de `getMesAgenda` (a lista pode
 * ter `null` nas células de preenchimento antes do dia 1 do mês — por isso
 * quem usa `getMesAgenda` recebe `(AgendaDay | null)[]`, não `AgendaDay[]`).
 */
export interface AgendaDay {
  data: Date;
  eventos: EnrichedAppointment[];
}

/**
 * Resumo do próximo compromisso, para o card da Home — retorno de
 * `getProximoCompromisso`. Forma própria, não é `EnrichedAppointment`:
 * campos reduzidos e renomeados (`dica` em vez de `observacoes`), e
 * `profissional` ganha um `foto: null` que não existe no `Appointment` cru
 * (mesma forma de `CareTeamMember` em messages.ts, repetida aqui inline
 * para não acoplar os dois arquivos por causa de um card só).
 */
export interface NextAppointmentSummary {
  id: string;
  tipo: AppointmentType;
  titulo: string;
  data: Date;
  diaLabel: string;
  hora: string;
  local: string;
  profissional: { nome: string; cargo: string; foto: string | null } | null;
  /** = `observacoes` do compromisso original; `null` quando não há. */
  dica: string | null;
}
