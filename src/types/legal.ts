// Tipos do domínio LGPD — modelados sobre `legal_document_versions` e
// `consent_records`.
//
// O banco só tem dois `kind` de documento hoje: `terms_of_use` e
// `privacy_policy`. Não existe um terceiro tipo para "dados sensíveis de
// saúde" (o 3º checkbox da tela de onboarding) — esse consentimento fica sob
// a política de privacidade, sem linha própria em `consent_records`.

/** `legal_document_kind` — os únicos dois tipos que o banco reconhece hoje. */
export type LegalDocumentKind = 'terms_of_use' | 'privacy_policy';

/**
 * Versão vigente de um documento legal (`is_current = true`). Só a vigente é
 * legível por quem não é admin — não há como um paciente ler uma versão
 * antiga.
 */
export interface LegalDocumentVersion {
  id: string;
  tipo: LegalDocumentKind;
  versao: number;
  corpo: string;
  publicadoEm: string | null;
  publicadoLabel: string | null;
}

/**
 * Consentimento já registrado pelo titular (`consent_records`), com o
 * documento que ele aceitou embutido — é o que a tela de Perfil → LGPD
 * mostra em vez de uma data fabricada.
 */
export interface ConsentRecordDetail {
  id: string;
  documentoId: string;
  tipoDocumento: LegalDocumentKind;
  versaoDocumento: number;
  aceitoEm: string;
  aceitoLabel: string;
  revogadoEm: string | null;
}
