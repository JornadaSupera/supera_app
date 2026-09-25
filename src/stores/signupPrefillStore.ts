import { create } from 'zustand';

// O e-mail que a pessoa digitou no login, levado ao cadastro para ela não ter
// de digitá-lo de novo.
//
// E-mail é dado pessoal: mora aqui, em memória, e não na URL nem no estado do
// roteador (os dois ficam no histórico) nem em `localStorage`. Vive só entre o
// toque no login e a abertura do cadastro, que o lê uma vez e o apaga.
//
// É o que a pessoa digitou numa tela, e não resposta do servidor: estado de
// cliente, por isso Zustand (Regra nº 9).

interface SignupPrefillState {
  email: string | null;
  setEmail: (email: string) => void;
  clear: () => void;
}

export const useSignupPrefillStore = create<SignupPrefillState>((set) => ({
  email: null,
  setEmail: (email) => set({ email }),
  clear: () => set({ email: null }),
}));
