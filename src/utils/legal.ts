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

/** Onde os documentos vigentes ficam publicados, abertos a qualquer pessoa. */
const LEGAL_PAGES_BASE_URL = 'https://jornada-supera-painel.web.app';

/**
 * Endereço de leitura completa de cada documento. O aceite antes do cadastro
 * aponta para aqui: sem conta ainda, o app não consegue ler `legal_document_versions`
 * (o banco fecha a leitura para quem não entrou), mas a página pública tem o texto
 * vigente.
 */
export const LEGAL_DOCUMENT_URLS: Record<LegalDocumentKind, string> = {
  terms_of_use: `${LEGAL_PAGES_BASE_URL}/termos`,
  privacy_policy: `${LEGAL_PAGES_BASE_URL}/privacidade`,
};
