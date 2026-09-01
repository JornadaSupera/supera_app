import { create } from 'zustand';
import { supabase } from '../services/supabaseClient';
import { getSessionIdentity, signOut as signOutRequest } from '../services/mockApi';
import type { SessionIdentity, SessionStatus } from '../types';

// Estado de sessão do paciente.
//
// A store não autentica ninguém: quem faz isso é o Supabase Auth. Aqui só
// reagimos a `onAuthStateChange`, que é a única fonte que enxerga também o
// que acontece fora do app — token renovado em segundo plano, sessão
// derrubada pelo servidor, link de recuperação aberto. Guardar o resultado do
// login "na mão" criaria uma segunda verdade que dessincroniza no primeiro
// refresh que falha.
//
// O token vive no armazenamento criptografado (Keychain/Keystore), gerenciado
// pelo próprio cliente Supabase. Esta store guarda apenas estado derivado, em
// memória: `patientId` e nome são PII e não são persistidos por nós.
//
// `status` começa em 'verificando' porque a leitura do cofre é assíncrona.
// Quem protege rota precisa tratar os estados intermediários — decidir antes
// da resposta expulsaria o usuário autenticado a cada abertura do app.

interface SessionState {
  status: SessionStatus;
  accountId: string | null;
  /** `patients.id`. `null` = conta sem cadastro de paciente vinculado. */
  patientId: string | null;
  /**
   * A sessão é de um acompanhante. Quando `true`, `patientId` é o id do
   * TUTELADO — e algumas escritas mudam de forma (ver `SessionIdentity`).
   */
  isCaregiver: boolean;
  fullName: string | null;
  /**
   * O usuário chegou por um link de redefinição de senha. Habilita a tela de
   * nova senha, que sem isso não teria como distinguir uma visita legítima de
   * alguém digitando a rota na barra de endereços.
   */
  recoveryPending: boolean;

  /** Liga o app ao Supabase Auth. Chamar uma vez, no boot. Idempotente. */
  initialize: () => void;
  /** Relê `accounts` + `patients` e recalcula o status. */
  refreshIdentity: () => Promise<void>;
  /** Aplica uma identidade já em mãos, sem ida extra ao servidor. */
  applyIdentity: (identity: SessionIdentity | null) => void;
  signOut: () => Promise<void>;
  clearRecovery: () => void;
}

const ANONYMOUS = {
  status: 'anonimo' as const,
  accountId: null,
  patientId: null,
  isCaregiver: false,
  fullName: null,
};

/**
 * Traduz a identidade em situação de acesso. A ordem importa: conta
 * desativada tem precedência sobre vínculo ausente, porque a revogação
 * (`set_account_active`) também derruba o vínculo — reportar "cadastro
 * pendente" nesse caso mandaria a pessoa para o suporte errado.
 */
function deriveStatus(identity: SessionIdentity | null): SessionStatus {
  if (!identity) return 'anonimo';
  if (!identity.isAccountActive) return 'conta-inativa';
  if (!identity.patientId) return 'sem-vinculo';
  return 'autenticado';
}

/** Cancela a inscrição em `onAuthStateChange`. Guarda de idempotência. */
let unsubscribe: (() => void) | null = null;

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'verificando',
  accountId: null,
  patientId: null,
  isCaregiver: false,
  fullName: null,
  recoveryPending: false,

  initialize: () => {
    // Sem variáveis de ambiente não há sessão possível. Resolver para
    // 'anonimo' evita o app ficar preso no Loading de 'verificando'.
    if (!supabase) {
      set({ ...ANONYMOUS });
      return;
    }

    // O StrictMode monta duas vezes em desenvolvimento; sem esta guarda
    // ficariam dois listeners disparando o dobro de leituras.
    if (unsubscribe) return;

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Nada de chamar o Supabase aqui dentro: o auth-js mantém um lock
      // enquanto o callback roda, e uma chamada aninhada trava a fila de
      // requisições. O trabalho real sai para fora com `setTimeout(…, 0)`.
      if (event === 'PASSWORD_RECOVERY') {
        set({ recoveryPending: true });
      }

      // 'SIGNED_OUT' chega tanto de logout explícito quanto de sessão
      // derrubada pelo servidor — inclusive o encerramento em 15 minutos de
      // sessão com fator MFA cadastrado e não verificado. Nos dois casos o
      // destino é o mesmo: estado anônimo, e o guard de rota leva ao login.
      if (!session) {
        set({ ...ANONYMOUS });
        return;
      }

      setTimeout(() => {
        void get().refreshIdentity();
      }, 0);
    });

    unsubscribe = () => data.subscription.unsubscribe();
  },

  refreshIdentity: async () => {
    try {
      get().applyIdentity(await getSessionIdentity());
    } catch {
      // Falha ao ler a identidade não pode virar acesso liberado. Mas também
      // não deve derrubar quem já estava dentro por causa de uma oscilação de
      // rede: a barreira real é a RLS, e uma leitura clínica que falhe vai
      // falhar de novo na tela. Só quem ainda não tinha identidade resolvida
      // cai para anônimo.
      if (!get().accountId) set({ ...ANONYMOUS });
    }
  },

  applyIdentity: (identity) => {
    set({
      status: deriveStatus(identity),
      accountId: identity?.accountId ?? null,
      patientId: identity?.patientId ?? null,
      isCaregiver: identity?.isCaregiver ?? false,
      fullName: identity?.fullName ?? null,
    });
  },

  signOut: async () => {
    await signOutRequest();
    // Não espera o evento: o retorno imediato evita a fração de segundo em
    // que a tela protegida ainda renderiza com os dados do usuário anterior.
    set({ ...ANONYMOUS, recoveryPending: false });
  },

  clearRecovery: () => set({ recoveryPending: false }),
}));

/**
 * Resolve quando a sessão deixa de estar em 'verificando'.
 *
 * A Splash precisa decidir entre Home e Onboarding, e essa decisão não pode
 * ser tomada com o status indefinido. Sem sessão, `onAuthStateChange` emite
 * `INITIAL_SESSION` com `session: null` e isto resolve como 'anonimo'.
 */
export function waitForResolvedSession(): Promise<SessionStatus> {
  const atual = useSessionStore.getState().status;
  if (atual !== 'verificando') return Promise.resolve(atual);

  return new Promise((resolve) => {
    const cancelar = useSessionStore.subscribe((state) => {
      if (state.status === 'verificando') return;
      cancelar();
      resolve(state.status);
    });
  });
}

/**
 * Apaga o token que versões anteriores gravavam em `localStorage` sem
 * criptografia. Sem isso, quem já usou o app ficaria com o token antigo em
 * texto claro no aparelho para sempre — o armazenamento novo usa outra chave,
 * então o valor velho nunca seria sobrescrito nem lido. Chamar uma vez no
 * boot; é barato e idempotente.
 */
export function clearLegacyPlaintextSession(): void {
  try {
    localStorage.removeItem('supera_session');
  } catch {
    // WebView sem localStorage disponível: não há legado para limpar.
  }
}
