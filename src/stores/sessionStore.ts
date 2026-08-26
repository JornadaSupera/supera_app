import { create } from 'zustand';
import { secureGet, secureRemove, secureSet } from '../services/secureStorage';

const SESSION_KEY = 'supera_session';

// Estado de sessão do paciente. Substitui as funções soltas de
// `services/session.ts` como fonte única de verdade — a diferença prática é
// que aqui o resultado da leitura do cofre fica em memória, então os
// componentes reagem à mudança em vez de cada um ler o storage por conta
// própria e ter que gerenciar seu próprio "carregando".
//
// O token em si vive no armazenamento criptografado (Keychain/Keystore); a
// store guarda apenas o estado derivado. Não é usado `persist` do Zustand de
// propósito: ele persistiria em localStorage, que é exatamente o que a
// migração para secure storage veio corrigir.
//
// `status` começa em 'verificando' porque a leitura do cofre é assíncrona.
// Quem protege rota precisa tratar os três estados — decidir antes da
// resposta expulsaria o usuário autenticado para o login a cada abertura.

export type SessionStatus = 'verificando' | 'autenticado' | 'anonimo';

interface SessionState {
  status: SessionStatus;
  /** Lê o cofre e sincroniza o estado. Chamar uma vez no boot do app. */
  carregar: () => Promise<void>;
  entrar: (token?: string) => Promise<void>;
  sair: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'verificando',

  carregar: async () => {
    const token = await secureGet(SESSION_KEY);
    set({ status: token ? 'autenticado' : 'anonimo' });
  },

  entrar: async (token = 'mock-session-token') => {
    await secureSet(SESSION_KEY, token);
    set({ status: 'autenticado' });
  },

  sair: async () => {
    await secureRemove(SESSION_KEY);
    set({ status: 'anonimo' });
  },
}));

/**
 * Apaga o token que versões anteriores gravavam em `localStorage` sem
 * criptografia. Sem isso, quem já usou o app ficaria com o token antigo em
 * texto claro no aparelho para sempre — o armazenamento novo usa outra chave
 * (`capacitor-storage_supera_session`), então o valor velho nunca seria
 * sobrescrito nem lido. Chamar uma vez no boot; é barato e idempotente.
 */
export function clearLegacyPlaintextSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // WebView sem localStorage disponível: não há legado para limpar.
  }
}
