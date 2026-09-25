// Tipos do acompanhante criado pelo paciente (T23).
//
// O acompanhante não recebe convite: o paciente cria a conta dele, com uma
// senha provisória, e envia os dados por WhatsApp ou SMS. O contrato com o
// banco (nomes, entradas, respostas e códigos de erro) está no item 30 do
// `PENDENCIAS_BANCO.md`; estes tipos o espelham — mude os dois juntos.

/** Como os dados de acesso chegam ao acompanhante. */
export type CaregiverDelivery = 'whatsapp' | 'sms';

/**
 * Códigos estáveis que as Edge Functions devolvem em `{ error }`. `unavailable`
 * e `incomplete_response` não vêm do banco: é o app dizendo que a função ainda
 * não existe (404) ou que a resposta de sucesso veio fora do combinado.
 */
export type CaregiverErrorCode =
  | 'not_patient_owner'
  | 'caregiver_already_active'
  | 'email_in_use'
  | 'invalid_phone'
  | 'sms_failed'
  | 'no_active_caregiver'
  | 'weak_password'
  | 'password_unchanged'
  | 'not_first_login'
  | 'temporary_password_expired'
  | 'unavailable'
  | 'incomplete_response';

/** Entrada de `create-caregiver`. */
export interface CreateCaregiverInput {
  fullName: string;
  email: string;
  /** Celular em E.164 (`+5548999999999`). */
  phone: string;
  delivery: CaregiverDelivery;
}

/** Entrada de `update-caregiver`: só nome e telefone mudam; o e-mail é o login. */
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
 * O que a criação (ou a nova senha) devolve. A senha provisória só vem quando
 * o envio é por WhatsApp — no SMS quem a manda é o servidor, e o app nunca a
 * vê. Ela existe UMA vez, nesta resposta: nunca vai para armazenamento.
 */
export interface CaregiverAccess {
  caregiverAccountId: string;
  temporaryPassword: string | null;
  /** ISO 8601. Depois disso a senha provisória não entra mais. */
  expiresAt: string;
}

/** O acompanhante ativo, como `get_my_caregiver()` o devolve ao titular. */
export interface MyCaregiver {
  caregiverAccountId: string;
  fullName: string;
  /** E.164. Mostrar mascarado por padrão. */
  phone: string;
  /** Mostrar mascarado por padrão. */
  email: string;
  /** ISO 8601. Quando o vínculo foi criado. */
  linkedAt: string;
  /** Ainda não trocou a senha provisória (nunca entrou, ou entrou e não trocou). */
  passwordIsTemporary: boolean;
  /** ISO 8601. Só faz sentido com `passwordIsTemporary`. */
  temporaryPasswordExpiresAt: string | null;
}

/** Um vínculo, ativo ou revogado — de `patient_caregivers`, sem nome de ninguém. */
export interface CaregiverLink {
  id: string;
  status: 'active' | 'revoked';
  /** ISO 8601. */
  grantedAt: string;
  /** ISO 8601, ou `null` enquanto ativo. */
  revokedAt: string | null;
}
