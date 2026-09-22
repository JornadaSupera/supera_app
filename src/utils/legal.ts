import type { LegalDocumentKind } from '../types';

/**
 * Nome de cada documento legal na tela. Um mapa só para o onboarding e o
 * Perfil: o histórico de consentimento precisa chamar o documento pelo mesmo
 * nome que a pessoa leu ao aceitar.
 */
export const LEGAL_DOCUMENT_LABELS: Record<LegalDocumentKind, string> = {
  terms_of_use: 'Termos de Uso',
  privacy_policy: 'Política de Privacidade',
};

/**
 * Documento de um consentimento no histórico. Sem tipo e versão, a versão
 * aceita já foi substituída e não pode mais ser lida (o paciente só lê a
 * vigente) — dizer isso vale mais que inventar um nome e uma versão.
 */
export function describeConsentDocument(
  kind: LegalDocumentKind | null,
  version: number | null
): string {
  if (!kind || version === null) return 'Versão anterior de um documento';
  return `${LEGAL_DOCUMENT_LABELS[kind]} (v${version})`;
}
