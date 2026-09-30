// Termos e consentimentos: os documentos vigentes, o aceite e o histórico.
//
// Nenhuma página fala com o Supabase direto: toda leitura e escrita passa pelos
// serviços, sob a RLS da sessão, e devolve os formatos de `src/types/` — as telas
// não conhecem nome de coluna nem forma de embed.
import { appError } from '../lib/appError';
import { requireSupabase } from './supabaseClient';
import type {
  ApiSuccessResult,
  LegalDocumentKind,
  LegalDocumentVersion,
  ConsentRecordDetail,
} from '../types';

/**
 * Versões vigentes dos documentos legais (`is_current = true`) — o texto que
 * a tela de onboarding e a tela de Perfil → LGPD exibem antes/depois do
 * aceite.
 *
 * O banco só tem dois `kind` hoje (`terms_of_use`, `privacy_policy` — ver
 * `src/types/legal.ts`), e pode não ter NENHUMA versão vigente publicada
 * ainda: a tela trata lista vazia como estado vazio real, não como erro —
 * mesma lógica de Orientações quando não há conteúdo publicado.
 */
export async function getCurrentLegalDocuments(): Promise<LegalDocumentVersion[]> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('legal_document_versions')
    .select('id, kind, version, body, published_at')
    .eq('is_current', true)
    .order('kind', { ascending: true });

  if (error) {
    throw appError('Não foi possível carregar os termos. Tente novamente.', error);
  }

  return (data ?? []).map((row) => {
    const publishedAt = row.published_at as string | null;
    return {
      id: row.id as string,
      kind: row.kind as LegalDocumentKind,
      version: row.version as number,
      body: row.body as string,
      publishedAt,
      publishedLabel: publishedAt ? new Date(publishedAt).toLocaleDateString('pt-BR') : null,
    };
  });
}

/**
 * Grava o aceite das versões vigentes (`rpc('accept_legal_terms')`).
 *
 * Idempotente: o banco tem `ON CONFLICT ... DO NOTHING` em `consent_records`,
 * então chamar de novo não duplica linha. Se não houver nenhuma versão
 * vigente publicada, a chamada é um no-op silencioso (a RPC não tem o que
 * inserir) — não é tratado como erro, só não grava consentimento nenhum.
 */
export async function acceptLegalTerms(): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const { error } = await client.rpc('accept_legal_terms');

  if (error) {
    throw appError('Não foi possível registrar seu aceite. Tente novamente.', error);
  }

  return { success: true };
}

/**
 * Consentimentos já registrados pelo titular (`consent_records`, RLS
 * `account_id = get_my_uid()`), com o documento aceito embutido — é o que a
 * tela de Perfil → LGPD mostra em vez de uma data fabricada.
 *
 * O embed volta nulo quando a versão aceita já foi substituída (o titular só
 * lê a vigente). Aí tipo e versão ficam `null`: inventar um documento num
 * histórico de consentimento seria registrar uma prova falsa.
 */
export async function getConsentRecords(): Promise<ConsentRecordDetail[]> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('consent_records')
    .select('id, document_version_id, accepted_at, revoked_at, legal_document_versions(kind, version)')
    .order('accepted_at', { ascending: false });

  if (error) {
    throw appError('Não foi possível carregar seus consentimentos. Tente novamente.', error);
  }

  return (data ?? []).map((row) => {
    const document = row.legal_document_versions as unknown as {
      kind: LegalDocumentKind;
      version: number;
    } | null;
    const acceptedAt = row.accepted_at as string;
    return {
      id: row.id as string,
      documentId: row.document_version_id as string,
      documentKind: document?.kind ?? null,
      documentVersion: document?.version ?? null,
      acceptedAt,
      acceptedLabel: new Date(acceptedAt).toLocaleDateString('pt-BR'),
      revokedAt: row.revoked_at as string | null,
    };
  });
}
