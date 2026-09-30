// Tipos do acompanhante criado pelo paciente (T23/T36).
//
// O acompanhante não recebe convite: o paciente cria a conta dele, com uma
// senha provisória, e envia os dados por WhatsApp ou SMS. O contrato com o
// banco (nomes, entradas, respostas e códigos de erro) está no guia do banco,
// §5.2, e nas Edge Functions em `supabase/functions/`; estes tipos o espelham
// campo a campo — mude os dois juntos.

/** Como os dados de acesso chegam ao acompanhante. */
export type CaregiverDelivery = 'whatsapp' | 'sms';

/**
 * O estado do vínculo, como `caregiver_link_status` no banco.
 *
 * **Só `active` dá acesso.** `pending` é o vínculo cuja senha provisória ainda
 * não foi trocada: o acompanhante entra no app e o banco devolve zero linhas
 * por qualquer caminho. Não é a tela que bloqueia (guia §5.2).
 */
export type CaregiverLinkStatus = 'pending' | 'active' | 'revoked';

/**
 * Códigos estáveis que as Edge Functions devolvem em `{ error }` e que as RPCs
 * levantam como `message`. `unavailable`, `incomplete_response` e `network` não
 * vêm do banco: é o app dizendo que a função não existe (404), que a resposta de
 * sucesso veio fora do combinado, ou que não houve conexão.
 */
export type CaregiverErrorCode =
  // criação
  | 'not_patient_owner'
  | 'caregiver_already_active'
  | 'email_in_use'
  | 'invalid_email'
  | 'invalid_name'
  | 'invalid_phone'
  | 'invalid_delivery'
  | 'caregiver_disabled'
  | 'rate_limited'
  // criação e nova senha
  | 'sms_failed'
  // nova senha e edição
  | 'caregiver_not_found'
  | 'reset_failed'
  // revogação
  | 'link_not_active'
  | 'forbidden'
  // escopo do acompanhante ([BANCO 32])
  | 'invalid_scope'
  // primeiro acesso do acompanhante
  | 'weak_password'
  | 'password_unchanged'
  | 'not_first_login'
  | 'temporary_password_expired'
  // do app, não do banco
  | 'unavailable'
  | 'incomplete_response'
  | 'network';

/** Entrada de `create-caregiver`. */
export interface CreateCaregiverInput {
  fullName: string;
  email: string;
  /** Celular em E.164 (`+5548999999999`). */
  phone: string;
  delivery: CaregiverDelivery;
  /**
   * As áreas que o titular liberou na criação. Só vai ao servidor quando o banco
   * tem o controle por área ([BANCO 32]); sem ele, `undefined` — e o escopo é o
   * fixo do contrato.
   */
  scopes?: CaregiverScope[];
}

/**
 * O aviso com que "Meu acompanhante" abre quando a senha foi emitida e não há
 * certeza de que chegou ao acompanhante. Em todos, a saída é a mesma e fica a
 * um toque: gerar outra senha e enviá-la pelo WhatsApp.
 *
 * - `created-sms-failed`: o acesso nasceu, o SMS não saiu;
 * - `reset-sms-failed`: a senha nova já vale, o SMS não saiu — o acompanhante
 *   está sem acesso até recebê-la;
 * - `whatsapp-unconfirmed`: o WhatsApp não assumiu a tela (não instalado, ou o
 *   sistema recusou abrir);
 * - `delivery-unconfirmed`: a resposta do servidor não chegou inteira (rede
 *   caiu no meio, resposta fora do combinado) e não dá para saber se a senha
 *   saiu.
 */
export type CaregiverDeliveryNotice =
  | 'created-sms-failed'
  | 'reset-sms-failed'
  | 'whatsapp-unconfirmed'
  | 'delivery-unconfirmed';

/** Entrada de `update_my_caregiver`: só nome e telefone mudam; o e-mail é o login. */
export interface UpdateCaregiverInput {
  fullName: string;
  /** Celular em E.164. */
  phone: string;
}

/** Entrada de `reset-caregiver-password`. */
export interface ResetCaregiverPasswordInput {
  delivery: CaregiverDelivery;
}

/**
 * O que a criação (ou a nova senha) devolve.
 *
 * A senha provisória só vem quando o envio é por WhatsApp — no SMS quem a manda
 * é o servidor, e o app nunca a vê. Ela existe UMA vez, nesta resposta: nunca
 * vai para armazenamento.
 *
 * `linkId` só vem na criação: `reset-caregiver-password` não o devolve, porque o
 * vínculo já existia. `phoneMasked` só vem no SMS que saiu.
 */
export interface CaregiverAccess {
  /** `null` na nova senha: o vínculo não mudou de identidade. */
  linkId: string | null;
  /** O e-mail de login, como o servidor o confirma. `null` no SMS. */
  login: string | null;
  temporaryPassword: string | null;
  /** ISO 8601. Depois disso a senha provisória não entra mais. */
  expiresAt: string;
  delivery: CaregiverDelivery;
  /** `(49) *****-1234`, como o servidor o mascarou. Só no SMS que saiu. */
  phoneMasked: string | null;
}

/**
 * O acompanhante do titular, como `get_my_caregiver()` o devolve.
 *
 * A função devolve zero ou uma linha, e só os estados `pending` e `active` —
 * vínculo revogado não aparece aqui (ele fica no histórico).
 */
export interface MyCaregiver {
  /** O vínculo em `patient_caregivers`. É ele que `revoke_caregiver_link` recebe. */
  linkId: string;
  caregiverAccountId: string;
  fullName: string;
  /** E.164. Mostrar mascarado por padrão. */
  phone: string;
  /** Mostrar mascarado por padrão. */
  email: string;
  /** `pending` = ainda não trocou a senha provisória e não lê nada. */
  status: Extract<CaregiverLinkStatus, 'pending' | 'active'>;
  /** ISO 8601. Quando o titular autorizou o vínculo. */
  grantedAt: string;
  /**
   * ISO 8601. Quando o acompanhante ativou o vínculo trocando a senha.
   *
   * **Não é `null` só porque o vínculo está `pending`**: um reset devolve o
   * status a `pending` e NÃO limpa esta coluna (o COMMENT dela diz: "Vinculo
   * `pending` pode ter valor: e o que sobrou de antes de um reset"). Para saber
   * se o acesso vale AGORA, olhe o `status`.
   */
  activatedAt: string | null;
  /** ISO 8601. Só faz sentido enquanto `pending`. */
  temporaryPasswordExpiresAt: string | null;
}

/** Um vínculo, em qualquer estado — de `patient_caregivers`, sem nome de ninguém. */
export interface CaregiverLink {
  id: string;
  status: CaregiverLinkStatus;
  /** ISO 8601. Quando o titular concedeu a autorização. */
  grantedAt: string;
  /**
   * ISO 8601. Quando o acompanhante ativou o vínculo. `null` se nunca ativou.
   * Um vínculo `pending` pode ter valor: é o que sobrou de antes de um reset.
   */
  activatedAt: string | null;
  /** ISO 8601, ou `null` enquanto vigente. */
  revokedAt: string | null;
}

/**
 * O vínculo visto pelo PRÓPRIO acompanhante — quem ele acompanha e desde
 * quando —, junto dos dados da conta dele.
 *
 * É o outro lado de `MyCaregiver`: aquele é o titular olhando para o
 * acompanhante; este é o acompanhante olhando para o próprio vínculo. Ele o lê
 * por `patient_caregivers_select_caregiver` ("o cuidador vê os vínculos DELE, e
 * só isso: ver não é gerenciar").
 *
 * O nome do tutelado NÃO vem daqui: vem de `get_my_ward()`, a única leitura que
 * o banco lhe dá sobre o paciente — e que não traz CPF, contato nem nascimento.
 */
export interface MyWardLink {
  linkId: string;
  status: CaregiverLinkStatus;
  /** ISO 8601. Quando o titular autorizou. */
  grantedAt: string;
  /** ISO 8601. Quando o acesso passou a valer. `null` se ainda não valeu. */
  activatedAt: string | null;
  /** A conta do próprio acompanhante. */
  account: {
    fullName: string;
    email: string;
    /** E.164, ou `null`. */
    phone: string | null;
  };
}

/** Por que uma senha provisória foi emitida. */
export type CaregiverIssuanceReason = 'created' | 'reset';

/**
 * Uma senha provisória emitida — o registro da autorização, lido de
 * `caregiver_credential_issuances` pelo titular
 * (`caregiver_credential_issuances_select_own`).
 *
 * A senha nunca está aqui: o banco guarda que ela foi emitida, para qual
 * vínculo, por qual canal e até quando valia.
 */
export interface CaregiverIssuance {
  id: string;
  linkId: string;
  reason: CaregiverIssuanceReason;
  channel: CaregiverDelivery;
  /** ISO 8601. */
  issuedAt: string;
  /** ISO 8601. */
  expiresAt: string;
}

/**
 * Uma área do acompanhamento que o titular pode liberar ou retirar do
 * acompanhante, uma a uma — o enum `caregiver_scope` do [BANCO 32].
 *
 * Cada código corresponde a um grupo fechado de políticas no banco, e é lá que
 * a regra vale: desligar `chat` faz as conversas sumirem do acompanhante em
 * qualquer caminho, não só nesta tela.
 */
export type CaregiverScope = 'schedule' | 'diary' | 'chat' | 'resources' | 'clinical_record';

/** Uma área e se ela está liberada — uma linha de `get_caregiver_scopes()`. */
export interface CaregiverScopeState {
  scope: CaregiverScope;
  enabled: boolean;
  /** ISO 8601. Desde quando vale a situação atual. `null` se o banco não informar. */
  updatedAt: string | null;
}

/**
 * O que o titular vê sobre as áreas do acompanhante.
 *
 * `supported` diz se o banco já tem o controle por área. Enquanto não tiver
 * (`get_caregiver_scopes` responde "função inexistente"), a tela mostra o escopo
 * fixo do contrato — que é o que o banco de fato impõe — e não interruptores,
 * que seriam um controle de segurança de mentira.
 */
export interface CaregiverScopeSettings {
  supported: boolean;
  /** Uma entrada por área, na ordem do catálogo. Vazio sem acompanhante. */
  scopes: CaregiverScopeState[];
}

/**
 * As áreas que o acompanhante logado pode ver — `get_my_ward_scopes()`.
 *
 * `supported: false` quer dizer que o banco ainda não tem o controle por área e
 * impõe o escopo fixo inteiro: tudo vale. É o comportamento de hoje.
 */
export interface WardScopes {
  supported: boolean;
  allowed: CaregiverScope[];
}
