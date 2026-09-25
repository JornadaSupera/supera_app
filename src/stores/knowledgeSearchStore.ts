import { create } from 'zustand';

// O que está digitado na busca da Central de Conhecimento.
//
// Mora aqui, e não no estado da tela, para sobreviver à ida e volta: a pessoa
// busca "febre", abre um resultado e, ao voltar, encontra a mesma busca. Só em
// memória — não vai para `localStorage` nem para o endereço (ficaria no
// histórico do navegador): o que alguém procura sobre o próprio tratamento é
// assunto dela. Some ao recarregar o app e na troca de conta
// (`handleIdentityChange`, em `sessionStore.ts`).

interface KnowledgeSearchState {
  query: string;
  setQuery: (query: string) => void;
  clear: () => void;
}

export const useKnowledgeSearchStore = create<KnowledgeSearchState>((set) => ({
  query: '',
  setQuery: (query) => set({ query }),
  clear: () => set({ query: '' }),
}));
