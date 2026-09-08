import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptLegalTerms, getConsentRecords, getCurrentLegalDocuments } from '../services/mockApi';

// Hooks de LGPD. Leitura é `.from()` direto (RLS já limita `consent_records`
// ao próprio titular e `legal_document_versions` à versão vigente); o aceite
// é a RPC `accept_legal_terms`, que grava o consentimento de verdade — ver
// `src/services/mockApi.ts`.

const LEGAL_DOCUMENTS_QUERY_KEY = ['legal-documents', 'current'] as const;
const CONSENT_RECORDS_QUERY_KEY = ['consent-records'] as const;

/**
 * Termos/política vigentes — Onboarding → LGPD e Perfil → LGPD.
 *
 * `enabled` existe porque `RequireAuth` chama isto (via `useNeedsLegalConsent`)
 * incondicionalmente, inclusive antes de a sessão resolver — sem o gate, a
 * consulta dispara com `anon` e o banco recusa (`revoke_anon_access`).
 */
export function useCurrentLegalDocuments(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: LEGAL_DOCUMENTS_QUERY_KEY,
    queryFn: getCurrentLegalDocuments,
    enabled: options.enabled ?? true,
  });
}

/** Consentimentos já registrados pelo titular — Perfil → LGPD. Mesmo motivo de `enabled` acima. */
export function useConsentRecords(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: CONSENT_RECORDS_QUERY_KEY,
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
 */
export function useNeedsLegalConsent(enabled: boolean) {
  const documentos = useCurrentLegalDocuments({ enabled });
  const consentimentos = useConsentRecords({ enabled });

  const isLoading = documentos.isLoading || consentimentos.isLoading;
  const isError = documentos.isError || consentimentos.isError;

  let needsConsent: boolean | undefined;
  if (!isLoading && !isError && documentos.data && consentimentos.data) {
    const documentosAceitosIds = new Set(consentimentos.data.map((c) => c.documentoId));
    needsConsent = documentos.data.some((doc) => !documentosAceitosIds.has(doc.id));
  }

  return { needsConsent, isLoading, isError };
}

/** Aceite dos termos vigentes, no fim do onboarding. */
export function useAcceptLegalTerms() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: acceptLegalTerms,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONSENT_RECORDS_QUERY_KEY });
    },
  });
}
