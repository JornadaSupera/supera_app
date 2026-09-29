import { create } from 'zustand';
import { queryClient } from '../lib/queryClient';
import { supabase } from '../services/supabaseClient';
import { getSessionIdentity, signOut as signOutRequest } from '../services/session';
import { registerCurrentDevice, unregisterCurrentDevice } from '../services/deviceRegistration';
import { clearPushUser, identifyPushUser } from '../services/pushNotifications';
import { useKnowledgeSearchStore } from './knowledgeSearchStore';
import { useCaregiverNoticeStore } from './caregiverNoticeStore';
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
// `status` começa em 'checking' porque a leitura do cofre é assíncrona.
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
  /** Acompanhante com a senha provisória ainda não trocada (ver `SessionIdentity`). */
  mustChangePassword: boolean;
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

/**
 * Janela mínima entre duas releituras disparadas por voltar ao primeiro plano.
 *
 * Trinta segundos: curto o bastante para a pessoa que teve o acesso revogado
 * cair na tela certa assim que reabrir o app, e longo o bastante para alternar
 * com o WhatsApp — o que o fluxo do acompanhante pede — sem uma leitura por
 * troca de app.
 */
const FOREGROUND_REFRESH_INTERVAL_MS = 30_000;

let lastForegroundRefresh = 0;

const ANONYMOUS = {
  status: 'anonymous' as const,
  accountId: null,
  patientId: null,
  isCaregiver: false,
  mustChangePassword: false,
  fullName: null,
};

/**
 * Traduz a identidade em situação de acesso. A ordem importa: conta
 * desativada tem precedência sobre vínculo ausente, porque a revogação
 * (`set_account_active`) também derruba o vínculo — reportar "cadastro
 * pendente" nesse caso mandaria a pessoa para o suporte errado.
 */
function deriveStatus(identity: SessionIdentity | null): SessionStatus {
  if (!identity) return 'anonymous';
  if (!identity.isAccountActive) return 'inactive';
  if (!identity.patientId) return 'unlinked';
  return 'authenticated';
}

/** Cancela a inscrição em `onAuthStateChange`. Guarda de idempotência. */
let unsubscribe: (() => void) | null = null;

/**
 * Único ponto que reage a uma troca de identidade da sessão. Toda transição
 * passa por aqui — login por senha, biometria, restauração de sessão no
 * boot, logout explícito (de qualquer tela) e `SIGNED_OUT` vindo do
 * servidor (revogação, expiração de MFA) — porque nenhum desses caminhos
 * passa por um hook em comum. Comparar com o valor anterior evita agir de
 * novo quando a conta não mudou (ex.: `refreshIdentity` reconfirmando quem
 * já estava autenticado).
 *
 * Duas responsabilidades saem daqui:
 * - Push: associa/desassocia o dispositivo no OneSignal e o registra em
 *   `device_tokens` (ver `pushNotifications.ts` e `deviceRegistration.ts`).
 *   O cancelamento do registro fica em `signOut`, que ainda tem a sessão viva.
 * - Cache do TanStack Query: descarta tudo. É onde a PHI vive enquanto o
 *   app está aberto — sem isto, um evento que não passa pelas mutations de
 *   `hooks/useAuth.ts` (revogação externa, renovação silenciosa de token)
 *   deixaria dado clínico da identidade anterior em memória, visível para
 *   quem entrar em seguida no mesmo aparelho.
 */
function handleIdentityChange(previousAccountId: string | null, next: SessionIdentity | null): void {
  const nextAccountId = next?.accountId ?? null;
  if (previousAccountId === nextAccountId) return;

  if (next) {
    identifyPushUser(next.accountId);
    // Também a cada abertura com sessão, o que mantém `last_seen_at` em dia.
    // Conta desativada fica de fora (ver `registerCurrentDevice`).
    if (next.isAccountActive) void registerCurrentDevice();
  } else {
    clearPushUser();
  }

  queryClient.clear();
  // Nem o que a pessoa anterior procurou na Central de Conhecimento.
  //
  // (A senha provisória do acompanhante não mora mais em store nenhuma: ela
  // vai da resposta do servidor direto para a mensagem do WhatsApp, no mesmo
  // toque, e não sobra em memória para ser limpa aqui.)
  useKnowledgeSearchStore.getState().clear();
  // Nem um aviso de entrega de acompanhante que era da conta anterior.
  useCaregiverNoticeStore.getState().clear();
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'checking',
  accountId: null,
  patientId: null,
  isCaregiver: false,
  mustChangePassword: false,
  fullName: null,
  recoveryPending: false,

  initialize: () => {
    // Sem variáveis de ambiente não há sessão possível. Resolver para
    // 'anonymous' evita o app ficar preso no Loading de 'checking'.
    if (!supabase) {
      set({ ...ANONYMOUS });
      return;
    }

    // O StrictMode monta duas vezes em desenvolvimento; sem esta guarda
    // ficariam dois listeners disparando o dobro de leituras.
    if (unsubscribe) return;

    // RELEITURA AO VOLTAR AO PRIMEIRO PLANO.
    //
    // O que muda fora do app e o app não fica sabendo: o titular revoga o
    // acompanhante, a recepção conclui o cadastro do paciente, a clínica
    // desativa a conta. `onAuthStateChange` não cobre nenhum desses — nenhum
    // deles mexe no token —, e sem esta releitura o acompanhante revogado
    // continuava com o app aberto vendo listas vazias e erro no Perfil, em vez
    // da tela de "sem vínculo".
    //
    // `visibilitychange` e não `@capacitor/app`: a WebView do Capacitor dispara
    // o evento do DOM ao voltar do segundo plano, e isso evita uma dependência
    // nova — que, além de precisar de aprovação, exigiria `cap sync` nas duas
    // plataformas.
    //
    // Só com sessão, e no máximo uma vez por janela: voltar ao app várias vezes
    // em sequência (trocar para o WhatsApp e voltar, no fluxo do acompanhante)
    // não pode virar uma rajada de leituras.
    const handleForeground = () => {
      if (document.visibilityState !== 'visible') return;
      if (!get().accountId) return;

      const agora = Date.now();
      if (agora - lastForegroundRefresh < FOREGROUND_REFRESH_INTERVAL_MS) return;
      lastForegroundRefresh = agora;

      void get().refreshIdentity();
    };

    document.addEventListener('visibilitychange', handleForeground);

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
        handleIdentityChange(get().accountId, null);
        set({ ...ANONYMOUS });
        return;
      }

      setTimeout(() => {
        void get().refreshIdentity();
      }, 0);
    });

    unsubscribe = () => {
      document.removeEventListener('visibilitychange', handleForeground);
      data.subscription.unsubscribe();
    };
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
    const previousAccountId = get().accountId;
    handleIdentityChange(previousAccountId, identity);

    // A conta é a mesma, mas a ficha ligada mudou (a recepção concluiu o
    // cadastro, ou o vínculo caiu): o que a RLS devolve muda junto, e o que
    // ficou em cache foi lido com o vínculo de antes. O descarte tem de vir
    // ANTES do `set`: é ele que abre o portão de rota, e um `clear()` depois
    // dele cancelaria em silêncio as consultas que o portão acabou de
    // começar — a tela ficaria em "Carregando…" para sempre.
    if (previousAccountId === (identity?.accountId ?? null) && get().patientId !== (identity?.patientId ?? null)) {
      queryClient.clear();
    }

    set({
      status: deriveStatus(identity),
      accountId: identity?.accountId ?? null,
      patientId: identity?.patientId ?? null,
      isCaregiver: identity?.isCaregiver ?? false,
      mustChangePassword: identity?.mustChangePassword ?? false,
      fullName: identity?.fullName ?? null,
    });
  },

  signOut: async () => {
    // Antes de encerrar: a RPC que desativa o aparelho exige a sessão viva.
    await unregisterCurrentDevice();
    await signOutRequest();
    handleIdentityChange(get().accountId, null);
    // Não espera o evento: o retorno imediato evita a fração de segundo em
    // que a tela protegida ainda renderiza com os dados do usuário anterior.
    set({ ...ANONYMOUS, recoveryPending: false });
  },

  clearRecovery: () => set({ recoveryPending: false }),
}));

/**
 * Resolve quando a sessão deixa de estar em 'checking'.
 *
 * A Splash precisa decidir entre Home e Onboarding, e essa decisão não pode
 * ser tomada com o status indefinido. Sem sessão, `onAuthStateChange` emite
 * `INITIAL_SESSION` com `session: null` e isto resolve como 'anonymous'.
 */
export function waitForResolvedSession(): Promise<SessionStatus> {
  const atual = useSessionStore.getState().status;
  if (atual !== 'checking') return Promise.resolve(atual);

  return new Promise((resolve) => {
    const cancelar = useSessionStore.subscribe((state) => {
      if (state.status === 'checking') return;
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
