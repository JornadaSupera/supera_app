import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  downloadMyDataExport,
  getMyDataSubjectRequests,
  requestDataRectification,
  revokeConsent,
} from '../services/dataSubject';
import { useSessionStore } from '../stores/sessionStore';
import { legalKeys } from './useLegal';

// Direitos do titular (guia do banco §5.19).
//
// Separado de `useLegal` de propósito: lá moram os termos e o aceite, que todo
// mundo atravessa no onboarding; aqui moram os pedidos formais do art. 18, que
// só o titular abre e acompanha.

export const dataSubjectKeys = {
  all: ['data-subject'] as const,
  requests: () => [...dataSubjectKeys.all, 'requests'] as const,
};

/** Dez minutos: o banco não muda de uma hora para outra, e a tela reabre muito. */
/**
 * Os pedidos do próprio titular, com andamento e o motivo de uma recusa.
 *
 * `enabled` porque `RequireAuth` consulta isto no ramo da conta desativada,
 * antes de a sessão ter resolvido — sem a sessão, a consulta sai como `anon` e
 * o banco recusa (`revoke_anon_access`).
 */
export function useMyDataSubjectRequests(options: { enabled?: boolean } = {}) {
  const accountId = useSessionStore((state) => state.accountId);

  return useQuery({
    queryKey: dataSubjectKeys.requests(),
    queryFn: getMyDataSubjectRequests,
    enabled: (options.enabled ?? true) && Boolean(accountId),
  });
}

/**
 * Baixa o pacote de dados e o grava no aparelho.
 *
 * `networkMode: 'always'`: sem rede a chamada falha na hora, em vez de ficar
 * pausada e abrir a folha de compartilhamento sozinha quando a rede voltar,
 * com a pessoa já em outra tela.
 *
 * Relê os pedidos ao terminar: a primeira entrega move o pedido de `granted`
 * para `executed`, e a tela precisa mostrar isso.
 */
export function useDownloadMyDataExport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requestId: string) => downloadMyDataExport(requestId),
    networkMode: 'always',
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dataSubjectKeys.requests() });
    },
  });
}

/**
 * Revoga um consentimento.
 *
 * Invalida o cache inteiro: sem consentimento vigente o portão de `RequireAuth`
 * devolve a pessoa ao aceite, e é ele que precisa reler primeiro.
 */
export function useRevokeConsent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (consentId: string) => revokeConsent(consentId),
    networkMode: 'always',
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: legalKeys.consentRecords() });
    },
  });
}

/**
 * Pede a correção dos dados — com o que corrigir, quando o banco já guarda o
 * texto (`note`), ou só o pedido. Relê os pedidos ao terminar: o novo aparece
 * em "Meus pedidos", e é por ele que a tela sabe que já há um em análise.
 */
export function useRequestDataRectification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (note: string) => requestDataRectification(note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dataSubjectKeys.requests() });
    },
  });
}
