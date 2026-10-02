import { create } from 'zustand';
import type { ScheduleViewKey } from '../types';

// O que a Agenda estava mostrando: a visão (mês, semana, lista), o filtro por
// tipo, a semana e o mês navegados e o dia escolhido no mês.
//
// Mora aqui, e não só no estado da tela, para sobreviver à ida e volta de um
// compromisso: abrir um evento na visão semanal e tocar em "Voltar" devolvia a
// Agenda em Lista, na semana de hoje e sem o filtro. Quem decide quando
// aproveitar é a própria Agenda (`ScheduleHub`): só ao VOLTAR para ela. Entrar
// pela aba ou por um atalho começa do zero, como sempre foi.
//
// Só em memória. Nada aqui é dado de paciente (a visão escolhida, um código de
// tipo e datas de calendário), mas some na troca de conta do mesmo jeito
// (`handleIdentityChange`, em `sessionStore.ts`).

interface ScheduleViewSnapshot {
  view: ScheduleViewKey;
  typeCode: string | null;
  weekReference: Date | null;
  monthReference: Date | null;
  selectedDay: Date | null;
}

interface ScheduleViewState extends ScheduleViewSnapshot {
  update: (partial: Partial<ScheduleViewSnapshot>) => void;
  reset: () => void;
}

const INITIAL: ScheduleViewSnapshot = {
  view: 'list',
  typeCode: null,
  weekReference: null,
  monthReference: null,
  selectedDay: null,
};

export const useScheduleViewStore = create<ScheduleViewState>((set) => ({
  ...INITIAL,
  update: (partial) => set(partial),
  reset: () => set({ ...INITIAL }),
}));
