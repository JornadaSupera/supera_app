import { create } from 'zustand';
import type { PushOpen } from '../types';

// O push que a pessoa tocou e que o app ainda não abriu.
//
// O toque pode chegar antes de haver para onde ir: com o app fechado, ele é o
// que abre o app, e a sessão ainda está sendo lida. Fica aqui até o
// `PushOpenHandler` (dentro do roteador) poder navegar. Só em memória: é
// estado de cliente, e a referência não sobrevive ao app fechar.

interface PushOpenState {
  pending: PushOpen | null;
  setPending: (open: PushOpen) => void;
  clear: () => void;
}

export const usePushOpenStore = create<PushOpenState>((set) => ({
  pending: null,
  setPending: (open) => set({ pending: open }),
  clear: () => set({ pending: null }),
}));
