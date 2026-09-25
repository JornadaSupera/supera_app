import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  completeFirstPassword,
  createCaregiver,
  getCaregiverLinks,
  getMyCaregiver,
  resetCaregiverPassword,
  revokeCaregiverLink,
  updateCaregiver,
} from '../services/caregiver';
import { useSessionStore } from '../stores/sessionStore';

// Reexportado para a tela de envio não importar de `services/` (Regra nº 9).
export { openWhatsApp } from '../services/whatsapp';
import type { CreateCaregiverInput, ResetCaregiverPasswordInput, UpdateCaregiverInput } from '../types';

// Hooks do acompanhante criado pelo paciente. Leitura é a RPC `get_my_caregiver`
// e `.from('patient_caregivers')` sob a RLS; toda escrita é Edge Function ou
// RPC (ver `services/caregiver.ts`).

export const caregiverKeys = {
  all: ['caregiver'] as const,
  mine: () => [...caregiverKeys.all, 'mine'] as const,
  links: () => [...caregiverKeys.all, 'links'] as const,
};

/** O acompanhante ativo, ou `null`. */
export function useMyCaregiver() {
  return useQuery({
    queryKey: caregiverKeys.mine(),
    queryFn: getMyCaregiver,
  });
}

/** Os vínculos (ativos e revogados), sem nome de ninguém. */
export function useCaregiverLinks() {
  return useQuery({
    queryKey: caregiverKeys.links(),
    queryFn: getCaregiverLinks,
  });
}

/**
 * Toda escrita relê o acompanhante e os vínculos, para a tela nunca mostrar o
 * que já mudou. Mutation não repete sozinha (ver `lib/queryClient.ts`): criar
 * duas vezes geraria duas contas.
 *
 * Toda escrita usa `networkMode: 'always'`: no modo padrão, sem rede a mutation
 * ficaria pausada e rodaria sozinha quando a rede voltasse — com o titular já
 * longe da tela, criando a conta, mandando o SMS ou invalidando a senha que ele
 * acabou de enviar. Assim ela falha na hora ("Sem conexão") e o titular repete.
 *
 * Não devolve a promessa da releitura de propósito: o TanStack Query esperaria
 * a releitura terminar antes de dar a resposta a quem chamou, e a tela que
 * criou o acompanhante já teria virado outra (a releitura acha o acompanhante e
 * a guarda do formulário manda para "Meu acompanhante") antes de conseguir ir
 * para o envio da senha.
 */
function useInvalidateCaregiver() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: caregiverKeys.all });
  };
}

export function useCreateCaregiver() {
  const invalidate = useInvalidateCaregiver();

  return useMutation({
    mutationFn: (input: CreateCaregiverInput) => createCaregiver(input),
    networkMode: 'always',
    // A resposta traz a senha provisória: o cache não a guarda além da tela
    // (ver `stores/caregiverHandoffStore.ts`).
    gcTime: 0,
    // No `sms_failed` a conta existe mesmo com o erro: por isso invalida também na falha.
    onSettled: invalidate,
  });
}

export function useResetCaregiverPassword() {
  const invalidate = useInvalidateCaregiver();

  return useMutation({
    mutationFn: (input: ResetCaregiverPasswordInput) => resetCaregiverPassword(input),
    networkMode: 'always',
    // Mesmo motivo do `useCreateCaregiver`: a resposta traz a senha provisória.
    gcTime: 0,
    onSettled: invalidate,
  });
}

export function useUpdateCaregiver() {
  const invalidate = useInvalidateCaregiver();

  return useMutation({
    mutationFn: (input: UpdateCaregiverInput) => updateCaregiver(input),
    networkMode: 'always',
    onSuccess: invalidate,
  });
}

export function useRevokeCaregiver() {
  const invalidate = useInvalidateCaregiver();

  return useMutation({
    mutationFn: (linkId: string) => revokeCaregiverLink(linkId),
    networkMode: 'always',
    onSuccess: invalidate,
  });
}

/**
 * Primeiro acesso do acompanhante: escolhe a senha. Depois da troca (e da
 * renovação da sessão, feita no serviço) a identidade é relida — é ela que
 * derruba a marca `mustChangePassword` e abre o resto do app.
 *
 * Também marca o acompanhante como velho no cache: no aparelho do titular (a
 * demonstração, em que os dois papéis dividem a mesma tela) a situação passa a
 * "Ativo" na próxima leitura. Na sessão do acompanhante não há esse cache, e a
 * marcação não custa nada.
 */
export function useCompleteFirstPassword() {
  const refreshIdentity = useSessionStore((state) => state.refreshIdentity);
  const invalidate = useInvalidateCaregiver();

  return useMutation({
    mutationFn: (password: string) => completeFirstPassword(password),
    networkMode: 'always',
    onSuccess: () => {
      invalidate();
      return refreshIdentity();
    },
  });
}
