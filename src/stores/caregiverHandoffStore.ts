import { create } from 'zustand';
import type { CaregiverDelivery } from '../types';

// A entrega dos dados de acesso ao acompanhante, entre a tela que cria e a que
// envia.
//
// A senha provisória aparece UMA vez, na resposta do servidor, e a tela de
// envio precisa dela para montar a mensagem do WhatsApp. Por isso mora aqui,
// em memória: não vai para `localStorage`, para a URL nem para o estado do
// roteador (ficariam no histórico). Some ao sair da tela de envio, ao trocar
// de conta e ao recarregar o app — quem perdeu a senha gera outra.
//
// É uma EXCEÇÃO DELIBERADA à regra de não guardar resposta de API em store
// (Regra nº 9): um segredo de uso único não é estado de servidor que se relê e
// se invalida, e o cache do TanStack Query o manteria vivo depois da tela. As
// duas mutations que o devolvem (`useCreateCaregiver` e
// `useResetCaregiverPassword`) têm `gcTime: 0`, para o cache não guardar a
// resposta além da tela que a recebeu.

export interface CaregiverHandoff {
  fullName: string;
  email: string;
  /** E.164. */
  phone: string;
  delivery: CaregiverDelivery;
  /** Só no WhatsApp, e só até sair da tela. */
  temporaryPassword: string | null;
  /** ISO 8601. */
  expiresAt: string;
  /** A conta existe, mas o SMS não saiu: a tela oferece gerar outra senha. */
  smsFailed: boolean;
}

interface CaregiverHandoffState {
  handoff: CaregiverHandoff | null;
  setHandoff: (handoff: CaregiverHandoff) => void;
  clear: () => void;
}

export const useCaregiverHandoffStore = create<CaregiverHandoffState>((set) => ({
  handoff: null,
  setHandoff: (handoff) => set({ handoff }),
  clear: () => set({ handoff: null }),
}));
