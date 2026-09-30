import { Capacitor } from '@capacitor/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getConfirmedPhone,
  linkPatientByVerifiedPhone,
  requestPasswordReset,
  resetPassword,
  signIn,
  signInWithProvider,
  signUp,
  updateAccountName,
} from '../services/auth';
import { hasStoredSession } from '../services/session';
import { isAppleSignInConfigured, isGoogleSignInConfigured, isUserCancelledError } from '../services/socialAuth';
import { AppError } from '../lib/appError';
import { useSessionStore } from '../stores/sessionStore';
import type {
  PasswordResetRequestInput,
  PatientLinkInput,
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

/** Chave do celular confirmado da conta (ver `useConfirmedPhone`). */
export const CONFIRMED_PHONE_KEY = ['auth', 'confirmed-phone'] as const;

/**
 * O celular já confirmado desta conta (`+55…`), ou `null`. Quem já confirmou o
 * número e só precisa corrigir CPF ou nascimento liga direto, sem SMS: para o
 * mesmo número o Auth não manda código nenhum.
 */
export function useConfirmedPhone() {
  return useQuery({
    queryKey: CONFIRMED_PHONE_KEY,
    queryFn: getConfirmedPhone,
    staleTime: 0,
  });
}

/**
 * Liga a conta da sessão à ficha do paciente, com o celular já confirmado —
 * o único caminho desde 29/09 (o código de ativação do Centro saiu).
 *
 * O cache é descartado ANTES de a identidade ser relida. Ligar a ficha não
 * muda a conta — então nada dispara a limpeza que a troca de identidade faz
 * sozinha —, e consultas que rodaram ainda "sem vínculo" podem ter guardado
 * respostas vazias da RLS. E tem de ser antes: a leitura da identidade é o que
 * abre o portão de rota, e um `clear()` depois dela cancelaria em silêncio as
 * consultas que o portão acabou de começar (o app ficava em "Carregando…").
 */
export function useLinkPatientByVerifiedPhone() {
  const refreshIdentity = useSessionStore((state) => state.refreshIdentity);
  const resetCache = useCacheReset();

  return useMutation({
    mutationFn: (input: PatientLinkInput) => linkPatientByVerifiedPhone(input),
    onSuccess: async () => {
      resetCache();
      await refreshIdentity();
    },
  });
}

/**
 * Login por Google ou Apple.
 *
 * Não aplica identidade nem limpa cache no sucesso — quem faz isso é a tela
 * (`Login.tsx`), porque o que fazer depois difere por plataforma: no
 * aparelho a sessão já está pronta e a tela precisa navegar sozinha; na web a
 * aba já está a caminho do provedor e quem trata o retorno é o
 * `onAuthStateChange` da store, quando o app recarrega com o código na URL.
 * Limpar o cache aqui seria limpar o de uma sessão que ainda é a anterior, e
 * para nada: o `SIGNED_IN` do retorno já faz isso.
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
 * Se o login com Google tem como funcionar neste build.
 *
 * Na web o caminho de redirect vale sempre. No aparelho ele não vale nunca — a
 * WebView não tem origem de retorno válida (ver `socialAuth.ts`) —, então o
 * que decide é o client ID desta plataforma estar configurado. Sem ele o
 * diálogo abriria e falharia no fim, depois de a pessoa já ter escolhido a
 * conta.
 *
 * Não é hook: o valor é constante do build. Mora aqui porque a tela não fala
 * com `services/` direto (Regra nº 9).
 */
export function isGoogleLoginAvailable(): boolean {
  return !Capacitor.isNativePlatform() || isGoogleSignInConfigured();
}

/**
 * Se o login com Apple tem como funcionar neste build.
 *
 * Só no iOS, e nunca depende dos client IDs do Google: são dois provedores
 * independentes (ver `socialAuth.ts`). Fazê-la funcionar na web ou no Android
 * exigiria infraestrutura que a cliente descartou — ver o comentário em
 * `Login.tsx`.
 */
export function isAppleLoginAvailable(): boolean {
  return isAppleSignInConfigured();
}

/** Mensagem de erro pronta para exibir, vinda de uma mutation de auth. */
export function describeMutationError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Se o login falhou por e-mail ou senha que não conferem.
 *
 * O servidor devolve o mesmo código para e-mail sem conta e para senha errada,
 * de propósito (ver `describeAuthError` em `services/auth.ts`). Então isto
 * NÃO diz que o e-mail não existe: diz só que vale oferecer os dois caminhos,
 * conferir a senha ou criar a conta.
 */
export function isInvalidCredentialsError(error: unknown): boolean {
  return error instanceof AppError && error.code === 'invalid_credentials';
}

/**
 * Se o erro de `useSignInWithProvider` foi a pessoa cancelando o diálogo
 * nativo por conta própria. Reexportado de `services/` para a tela não
 * importar de lá direto (Regra nº 9).
 */
export const isProviderLoginCancelled = isUserCancelledError;

/**
 * Diz se há uma sessão guardada no cofre, sem contatar o servidor — é o que
 * torna a biometria honesta (ver `services/session.ts`). Chave própria,
 * fora de qualquer hierarquia: não é dado do paciente, é uma pergunta sobre
 * o próprio dispositivo.
 */
export function useHasStoredSession() {
  return useQuery({
    queryKey: ['stored-session'],
    queryFn: hasStoredSession,
  });
}
