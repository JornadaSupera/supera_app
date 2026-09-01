import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  aceitarConviteCuidador,
  cancelarConviteCuidador,
  convidarCuidador,
  getCuidador,
  removerCuidador,
} from '../services/mockApi';
import { useSessionStore } from '../stores/sessionStore';
import type { InviteCaregiverInput } from '../types';

// Hooks do Cuidador. Todo o ciclo é RPC — as duas tabelas não têm política de
// escrita nenhuma, nem para o titular.

export const CAREGIVER_QUERY_KEY = ['caregiver'] as const;

export function useCaregiver() {
  return useQuery({
    queryKey: CAREGIVER_QUERY_KEY,
    queryFn: getCuidador,
  });
}

/**
 * Cria o convite.
 *
 * ⚠️ O resultado carrega o **token em texto puro**, devolvido uma única vez
 * pelo banco. Ele fica no estado da mutation — memória, que morre com a tela
 * — e **não** vai para o cache de `useQuery`: cache é feito para sobreviver,
 * e esse valor não pode sobreviver a nada. Por isso a invalidação recarrega
 * `getCuidador` (que não traz token) em vez de semear o cache com a resposta.
 */
export function useInviteCaregiver() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: InviteCaregiverInput) => convidarCuidador(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CAREGIVER_QUERY_KEY });
    },
  });
}

/**
 * Aceita o convite e vira acompanhante.
 *
 * `refreshIdentity()` depois do sucesso não é conveniência: até o aceite a
 * sessão está em `sem-vinculo` (nenhuma linha de `patients` visível), e é a
 * criação do vínculo que faz `my_ward_patient_ids()` passar a devolver o
 * tutelado. Sem reler a identidade, a pessoa continuaria vendo a tela de
 * "cadastro não vinculado" mesmo já sendo acompanhante.
 */
export function useAcceptCaregiverInvitation() {
  const refreshIdentity = useSessionStore((state) => state.refreshIdentity);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: aceitarConviteCuidador,
    onSuccess: async () => {
      // O cache pode carregar respostas vazias das consultas que rodaram
      // enquanto a sessão ainda não tinha vínculo nenhum.
      queryClient.clear();
      await refreshIdentity();
    },
  });
}

/** Cancela o convite pendente — a única forma de invalidar um token emitido. */
export function useCancelCaregiverInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelarConviteCuidador,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CAREGIVER_QUERY_KEY });
    },
  });
}

/** Revoga o vínculo ativo. Vale na hora. */
export function useRevokeCaregiverLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: removerCuidador,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CAREGIVER_QUERY_KEY });
    },
  });
}
