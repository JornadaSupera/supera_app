// Tipos do domínio Cuidador — modelados sobre `caregiver_invitations` e
// `patient_caregivers`.
//
// **O titular não enxerga quem é o cuidador dele.** Não é lacuna de
// modelagem: `caregivers` só é legível pelo próprio cuidador, pela equipe e
// pela administração (`caregivers_select_own` compara com a conta da sessão),
// e o nome nem sequer mora ali — mora em `accounts`, cuja política de leitura
// é a própria linha. O que o titular tem é **o contato para onde ele mesmo
// mandou o convite** (`caregiver_invitations.destination`), e é por ele que o
// vínculo é identificado na tela.
//
// Campos do mock que não existem no banco e foram removidos:
//
// | Campo removido | Motivo                                              |
// |----------------|-----------------------------------------------------|
// | `nome`         | não há coluna, e o nome real não é legível pelo titular |
// | `parentesco`   | não há coluna                                       |

/** `caregiver_invitation_channel` — o código ramifica no valor (remetente de SMS ou de e-mail). */
export type CaregiverContactMethod = 'sms' | 'email';

/**
 * Eventos da linha do tempo de vínculos, derivados dos timestamps das duas
 * tabelas.
 *
 * Sem `convite_aceito`: o aceite e a criação do vínculo são o mesmo ato, no
 * mesmo instante — dois itens no mesmo horário dizendo a mesma coisa só
 * poluiriam a linha do tempo. `vinculo_ativo` já conta essa história.
 */
export type CaregiverHistoryEvent =
  | 'convite_enviado'
  | 'convite_cancelado'
  | 'vinculo_ativo'
  | 'revogado';

/**
 * Convite pendente. No máximo um por paciente — o índice parcial
 * `uq_caregiver_invitations_pending` garante.
 *
 * Como o convite **não expira**, um pendente é uma chave viva: cancelá-lo é a
 * única forma de invalidá-lo.
 */
export interface CaregiverInvitation {
  id: string;
  canal: CaregiverContactMethod;
  /** Telefone ou e-mail para onde o convite foi endereçado. */
  destino: string;
  criadoEm: string;
  criadoLabel: string;
}

/**
 * Vínculo ativo. No máximo um por paciente
 * (`uq_patient_caregivers_active`).
 */
export interface CaregiverLink {
  id: string;
  /** Contato do convite que originou o vínculo — a identificação possível. */
  contato: string | null;
  canal: CaregiverContactMethod | null;
  vinculadoEm: string;
  vinculadoLabel: string;
}

/** Item da linha do tempo de vínculos. */
export interface CaregiverHistoryItemDetail {
  /** Chave estável de render: `${origem}-${evento}`. */
  id: string;
  evento: CaregiverHistoryEvent;
  contato: string | null;
  data: string;
  dataLabel: string;
}

/** Retorno de `getCuidador`. */
export interface CaregiverInfo {
  atual: CaregiverLink | null;
  convitePendente: CaregiverInvitation | null;
  historico: CaregiverHistoryItemDetail[];
}

/** Entrada de `convidarCuidador`. */
export interface InviteCaregiverInput {
  canal: CaregiverContactMethod;
  destino: string;
}

/**
 * Retorno de `invite_caregiver`.
 *
 * ⚠️ `token` vem em texto puro **uma única vez** — o banco guarda só o
 * SHA-256, e não há como reemitir. Precisa ser entregue à pessoa convidada na
 * hora e **jamais persistido**: nem em log, nem em storage, nem em estado que
 * sobreviva à sessão.
 */
export interface InviteCaregiverResult {
  success: true;
  invitationId: string;
  token: string;
}

/**
 * Retorno de `accept_caregiver_invitation`.
 *
 * O aceite é o ato que **cria o perfil de cuidador**: antes dele a pessoa tem
 * conta e mais nada. Depois, `my_ward_patient_ids()` passa a devolver o
 * tutelado, e a sessão dela deixa de ser "sem vínculo".
 */
export interface AcceptInvitationResult {
  success: true;
  linkId: string;
}
