import { create } from 'zustand';
import type { CaregiverDeliveryNotice } from '../types';

// O que a tela de adicionar precisa dizer a "Meu acompanhante" ao voltar para
// ela: um aviso de entrega e se um acompanhante acabou de ser criado.
//
// Em memória, e não no estado do roteador: o estado do roteador vai para o
// histórico do navegador e SOBREVIVE a recarregar a página — um aviso "o SMS
// não saiu" reapareceria depois de resolvido. Aqui ele some ao recarregar, ao
// trocar de conta e ao ser lido.
//
// Não guarda nada do servidor nem segredo nenhum: só qual aviso mostrar.

interface CaregiverNoticeState {
  /** O aviso que "Meu acompanhante" deve mostrar, ou `null`. */
  notice: CaregiverDeliveryNotice | null;
  /**
   * Um acompanhante acabou de ser criado e a releitura ainda pode não ter
   * chegado: enquanto isso, a gestão espera em vez de dizer "sem acompanhante".
   */
  expectCaregiver: boolean;
  /** Registra o resultado da criação para a gestão mostrar. */
  report: (result: { notice: CaregiverDeliveryNotice | null; expectCaregiver: boolean }) => void;
  setNotice: (notice: CaregiverDeliveryNotice | null) => void;
  settleExpectation: () => void;
  clear: () => void;
}

export const useCaregiverNoticeStore = create<CaregiverNoticeState>((set) => ({
  notice: null,
  expectCaregiver: false,
  report: ({ notice, expectCaregiver }) => set({ notice, expectCaregiver }),
  setNotice: (notice) => set({ notice }),
  settleExpectation: () => set({ expectCaregiver: false }),
  clear: () => set({ notice: null, expectCaregiver: false }),
}));
