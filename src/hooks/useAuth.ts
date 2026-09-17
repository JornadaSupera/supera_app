import { Capacitor } from '@capacitor/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  activatePatientAccount,
  hasStoredSession,
  requestPasswordReset,
  resetPassword,
  signIn,
  signInWithProvider,
  signUp,
  updateAccountName,
} from '../services/mockApi';
import { isNativeSocialLoginConfigured } from '../services/socialAuth';
import { useSessionStore } from '../stores/sessionStore';
import type {
  PasswordResetRequestInput,
  PatientActivationInput,
  ResetPasswordInput,
  SignInCredentials,
  OAuthProvider,
  SignUpInput,
} from '../types';

// Hooks de autenticação. As telas não falam com `services/` nem com o
// Supabase direto — chamam daqui, e ganham `isPending`/`error` de graça.

/**
 * Descarta todo o cache de dados.
 *
 * O TanStack Query é onde a PHI vive enquanto o app está aberto (a regra é
 * não persistir dado de paciente no navegador). Trocar de usuário sem limpar
 * deixaria o diário, a agenda e as conversas de quem saiu visíveis para quem
 * entra — no mesmo aparelho, que é o caso comum de um celular compartilhado
 * em família.
 */
function useCacheReset(): () => void {
  const queryClient = useQueryClient();
  return () => queryClient.clear();
}

/**
 * Login por e-mail + senha. Em caso de sucesso a identidade já volta da
 * chamada, então é aplicada direto na store — sem uma segunda ida ao
 * servidor só para descobrir quem entrou.
 */
export function useSignIn() {
  const applyIdentity = useSessionStore((state) => state.applyIdentity);
  const resetCache = useCacheReset();

  return useMutation({
    mutationFn: (credentials: SignInCredentials) => signIn(credentials),
    onSuccess: (identity) => {
      resetCache();
      applyIdentity(identity);
    },
  });
}

/**
 * Criação de conta.
 *
 * Não aplica identidade na store: quando o projeto cria sessão junto,
 * `onAuthStateChange` já dispara e a store se atualiza sozinha; quando exige
 * confirmação de e-mail, não há sessão nenhuma para aplicar. Deixar a store
 * fora daqui evita as duas verdades.
 *
 * O cache é limpo mesmo assim — quem cria conta pode estar num aparelho onde
 * outra pessoa usou o app antes, e dado de paciente não pode atravessar essa
 * troca.
 */
export function useSignUp() {
  const resetCache = useCacheReset();

  return useMutation({
    mutationFn: (input: SignUpInput) => signUp(input),
    onSuccess: () => resetCache(),
  });
}

/**
 * Ativação do app: liga a conta da sessão à ficha do paciente.
 *
 * O cache é descartado e a identidade relida antes de a tela seguir. Ligar a
 * ficha não muda a conta — então nada dispara a limpeza que a troca de
 * identidade faz sozinha —, e consultas que rodaram ainda "sem vínculo"
 * podem ter guardado respostas vazias da RLS.
 */
export function useActivatePatientAccount() {
  const refreshIdentity = useSessionStore((state) => state.refreshIdentity);
  const resetCache = useCacheReset();

  return useMutation({
    mutationFn: (input: PatientActivationInput) => activatePatientAccount(input),
    onSuccess: async () => {
      resetCache();
      await refreshIdentity();
    },
  });
}

/**
 * Login por Google ou Apple.
 *
 * Não aplica identidade nem limpa cache no sucesso: "sucesso" aqui é só ter
 * conseguido sair para o provedor — a aba já está a caminho dele. Quem trata o
 * retorno é o `onAuthStateChange` da store, quando o app recarrega com o código
 * na URL. Limpar o cache aqui seria limpar o de uma sessão que ainda é a
 * anterior, e para nada: o `SIGNED_IN` do retorno já faz isso.
 */
export function useSignInWithProvider() {
  return useMutation({
    mutationFn: (provider: OAuthProvider) => signInWithProvider(provider),
  });
}

/**
 * Grava o nome da conta e relê a identidade.
 *
 * A releitura não é opcional: `fullName` da store é o que decide se a tela que
 * pede o nome continua na frente. Sem ela, a pessoa gravaria o nome e seguiria
 * vendo o mesmo pedido.
 */
export function useUpdateAccountName() {
  const refreshIdentity = useSessionStore((state) => state.refreshIdentity);

  return useMutation({
    mutationFn: (fullName: string) => updateAccountName(fullName),
    onSuccess: async () => {
      await refreshIdentity();
    },
  });
}

/** Envio do link de redefinição de senha. */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (input: PasswordResetRequestInput) => requestPasswordReset(input),
  });
}

/** Gravação da nova senha, ao final do fluxo de recuperação. */
export function useResetPassword() {
  const clearRecovery = useSessionStore((state) => state.clearRecovery);

  return useMutation({
    mutationFn: (input: ResetPasswordInput) => resetPassword(input),
    onSuccess: () => clearRecovery(),
  });
}

/** Logout. Limpa a sessão e todo o dado de paciente em cache. */
export function useSignOut() {
  const storeSignOut = useSessionStore((state) => state.signOut);
  const resetCache = useCacheReset();

  return useMutation({
    mutationFn: () => storeSignOut(),
    // `onSettled`, não `onSuccess`: mesmo se o servidor recusar o logout, a
    // sessão local já foi descartada — o cache não pode sobreviver a ela.
    onSettled: () => resetCache(),
  });
}

/**
 * Se o login federado (Google/Apple) tem como funcionar neste build.
 *
 * Na web o caminho de redirect vale sempre. No aparelho ele não vale nunca — a
 * WebView não tem origem de retorno válida (ver `socialAuth.ts`) —, então o que
 * decide é o caminho nativo estar configurado. Sem os client IDs o diálogo
 * abriria e falharia no fim, depois de a pessoa já ter escolhido a conta.
 *
 * Não é hook: o valor é constante do build. Mora aqui porque a tela não fala
 * com `services/` direto (Regra nº 9).
 */
export function isFederatedLoginAvailable(): boolean {
  return !Capacitor.isNativePlatform() || isNativeSocialLoginConfigured();
}

/** Mensagem de erro pronta para exibir, vinda de uma mutation de auth. */
export function describeMutationError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Diz se há uma sessão guardada no cofre, sem contatar o servidor — é o que
 * torna a biometria honesta (ver `services/mockApi.ts`). Chave própria,
 * fora de qualquer hierarquia: não é dado do paciente, é uma pergunta sobre
 * o próprio dispositivo.
 */
export function useHasStoredSession() {
  return useQuery({
    queryKey: ['stored-session'],
    queryFn: hasStoredSession,
  });
}
