import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requestPasswordReset, resetPassword, signIn, signUp } from '../services/mockApi';
import { useSessionStore } from '../stores/sessionStore';
import type {
  PasswordResetRequestInput,
  ResetPasswordInput,
  SignInCredentials,
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

/** Mensagem de erro pronta para exibir, vinda de uma mutation de auth. */
export function describeMutationError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
