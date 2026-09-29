import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptLegalTerms, getConsentRecords, getCurrentLegalDocuments } from '../services/legal';
import { requestAccountDeletion, requestDataExport } from '../services/dataSubject';
import { openInAppBrowser } from '../services/inAppBrowser';
import { LEGAL_DOCUMENT_URLS } from '../utils/legal';
import type { LegalDocumentKind } from '../types';

// Hooks de LGPD. Leitura é `.from()` direto (RLS já limita `consent_records`
// ao próprio titular e `legal_document_versions` à versão vigente); o aceite
// é a RPC `accept_legal_terms`, que grava o consentimento de verdade — ver
// `src/services/legal.ts`.

/** Chaves do domínio: termos vigentes e consentimentos do titular. */
export const legalKeys = {
  all: ['legal'] as const,
  currentDocuments: () => [...legalKeys.all, 'documents', 'current'] as const,
  consentRecords: () => [...legalKeys.all, 'consent-records'] as const,
};

/**
 * Termos/política vigentes — Onboarding → LGPD e Perfil → LGPD.
 *
 * `enabled` existe porque `RequireAuth` chama isto (via `useNeedsLegalConsent`)
 * incondicionalmente, inclusive antes de a sessão resolver — sem o gate, a
 * consulta dispara com `anon` e o banco recusa (`revoke_anon_access`).
 */
export function useCurrentLegalDocuments(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: legalKeys.currentDocuments(),
    queryFn: getCurrentLegalDocuments,
    enabled: options.enabled ?? true,
  });
}

/** Consentimentos já registrados pelo titular — Perfil → LGPD. Mesmo motivo de `enabled` acima. */
export function useConsentRecords(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: legalKeys.consentRecords(),
    queryFn: getConsentRecords,
    enabled: options.enabled ?? true,
  });
}

/**
 * `true` quando existe ao menos um documento vigente que a conta ainda não
 * aceitou — é o que `RequireAuth` usa para desviar para `/onboarding/lgpd`
 * antes de liberar qualquer tela protegida. `undefined` enquanto as duas
 * consultas não resolveram (trate como "ainda não sei", não como "não
 * precisa") ou enquanto `enabled` for `false`.
 *
 * `isError` e `refetch` existem para o portão FECHAR na falha: sem saber se a
 * conta consentiu, liberar o conteúdo clínico seria tratar "não sei" como
 * "sim".
 */
export function useNeedsLegalConsent(enabled: boolean) {
  const documents = useCurrentLegalDocuments({ enabled });
  const consents = useConsentRecords({ enabled });

  const isLoading = documents.isLoading || consents.isLoading;
  const isError = documents.isError || consents.isError;

  let needsConsent: boolean | undefined;
  if (!isLoading && !isError && documents.data && consents.data) {
    // Só os aceites VIGENTES contam. Um consentimento revogado — pelo pedido do
    // titular (`consent_revocation`), pela execução de um pedido de exclusão ou
    // pelo Encarregado de Dados — continua na tabela, com `revoked_at`
    // preenchido; contá-lo deixaria a pessoa navegando com o consentimento
    // formalmente revogado, que é tratamento de dado de saúde sem base legal.
    //
    // O banco passou a aceitar o reaceite da MESMA versão depois de revogar
    // (`uq_consent_records_active … WHERE revoked_at IS NULL`, 25/09/2026), e é
    // por isso que mandar de volta ao portão resolve em vez de prender.
    const acceptedDocumentIds = new Set(
      consents.data.filter((c) => c.revokedAt === null).map((c) => c.documentId)
    );
    needsConsent = documents.data.some((doc) => !acceptedDocumentIds.has(doc.id));
  }

  const { refetch: refetchDocuments } = documents;
  const { refetch: refetchConsents } = consents;
  const refetch = useCallback(() => {
    void refetchDocuments();
    void refetchConsents();
  }, [refetchDocuments, refetchConsents]);

  return { needsConsent, isLoading, isError, refetch };
}

/**
 * Aceite dos termos vigentes, no fim do onboarding.
 *
 * Só termina depois de reler os consentimentos, porque o portão da próxima
 * tela decide com o que estiver no cache — com o valor antigo, devolveria a
 * pessoa para os termos que ela acabou de aceitar. `invalidateQueries` não
 * basta: nesta tela a consulta do portão está desligada, e consulta desligada
 * não é refeita. O `staleTime: 0` força a ida ao banco mesmo com o cache
 * "fresco" pelo padrão de 1 minuto. Se a releitura falhar, o aceite fica em
 * erro e o portão continua fechado.
 */
export function useAcceptLegalTerms() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: acceptLegalTerms,
    onSuccess: () =>
      queryClient.fetchQuery({
        queryKey: legalKeys.consentRecords(),
        queryFn: getConsentRecords,
        staleTime: 0,
      }),
  });
}

/**
 * Solicita a exportação dos dados do titular (direito de portabilidade,
 * README §6) — Perfil → LGPD. Sucesso/erro ficam por conta de quem chama
 * (toast), passados a `mutate`/`mutateAsync`.
 */
export function useRequestDataExport() {
  return useMutation({
    mutationFn: requestDataExport,
  });
}

/** Solicita a exclusão da conta (direito de eliminação, README §6) — Perfil → LGPD. */
export function useRequestAccountDeletion() {
  return useMutation({
    mutationFn: requestAccountDeletion,
  });
}

/**
 * Abre um documento legal (Termos de Uso ou Política de Privacidade) na janela
 * de navegação do app, para a pessoa ler o texto completo sem sair dele. É o
 * endereço público do painel: sem conta ainda, o app não lê os documentos do
 * banco.
 *
 * `networkMode: 'always'`: abrir a janela do app é um efeito local e não
 * depende da rede. No modo padrão, se a conexão caísse com o app aberto, o
 * TanStack Query seguraria a mutação (`isPending` fixo) e só abriria a janela
 * quando a rede voltasse, talvez por cima de outra tela. Sem rede, a própria
 * janela mostra a página de erro de conexão.
 */
export function useOpenLegalDocument() {
  return useMutation({
    networkMode: 'always',
    mutationFn: (kind: LegalDocumentKind) => openInAppBrowser(LEGAL_DOCUMENT_URLS[kind]),
  });
}
