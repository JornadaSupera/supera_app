import { AppError } from './appError';
import type { CaregiverErrorCode } from '../types';

// O erro das funções do acompanhante e o texto de cada código.
//
// Mora em `lib/` (e não em `services/`) porque as telas precisam reconhecer o
// `sms_failed` e ler o vínculo que foi criado mesmo com o erro, e páginas não
// importam de `services/`.
//
// Os códigos são o contrato com o banco: as Edge Functions os devolvem em
// `{ error }` (`supabase/functions/_shared/common.ts`, mapa `STATUS_BY_ERROR`)
// e as RPCs os levantam como `message` (`RAISE EXCEPTION 'nome'`). O guia do
// banco os lista em §5.2, na tabela "Erros".

/** Texto pronto para a tela, por código estável do banco (guia do banco §5.2). */
export const CAREGIVER_ERROR_MESSAGES: Record<CaregiverErrorCode, string> = {
  not_patient_owner: 'Só o titular da conta pode gerenciar o acompanhante.',
  caregiver_already_active: 'Você já tem um acompanhante. Revogue o acesso dele para adicionar outro.',
  email_in_use: 'Este e-mail já está em uso em outra conta. Use outro e-mail.',
  invalid_email: 'Informe um e-mail válido.',
  invalid_name: 'Informe o nome completo do acompanhante.',
  invalid_phone: 'Informe um celular com DDD válido. Telefone fixo não recebe SMS nem WhatsApp.',
  invalid_delivery: 'Escolha como enviar os dados de acesso.',
  caregiver_disabled: 'O acesso desta pessoa foi desativado pelo Centro. Fale com a recepção.',
  rate_limited: 'Você gerou muitas senhas nas últimas 24 horas. Tente de novo amanhã.',
  // O texto genérico do `sms_failed`. Os dois casos que o separam (provedor
  // desligado × mensagem que não saiu) têm texto próprio na tela, montado a
  // partir de `CaregiverError.smsProviderUnavailable`.
  sms_failed: 'Não foi possível enviar o SMS agora.',
  caregiver_not_found: 'Você não tem um acompanhante no momento.',
  reset_failed: 'Não foi possível trocar a senha agora. O acesso fica suspenso até você tentar de novo.',
  link_not_active: 'Este acesso já não está ativo. Atualize a tela.',
  forbidden: 'Só o titular da conta pode fazer isso.',
  invalid_scope: 'Esta área não existe mais. Atualize a tela.',
  weak_password: 'A senha precisa ter pelo menos 10 caracteres, com letras e números.',
  password_unchanged: 'A nova senha precisa ser diferente da senha provisória.',
  not_first_login: 'Esta conta já trocou a senha provisória.',
  temporary_password_expired: 'A senha provisória venceu. Peça uma nova a quem cadastrou você.',
  unavailable: 'Este recurso ainda não está disponível. Fale com a recepção do Centro.',
  incomplete_response:
    'O servidor respondeu de um jeito inesperado. Em "Meu acompanhante", confira se o acesso foi criado e, se preciso, gere uma nova senha.',
  network: 'Sem conexão com o servidor. Verifique a internet e tente de novo.',
};

/**
 * O `detail` que as funções mandam junto do `sms_failed` quando o Twilio ainda
 * não tem credencial: nada foi criado nem alterado.
 */
export const SMS_PROVIDER_UNAVAILABLE_DETAIL = 'sms_provider_not_configured';

/**
 * O texto do `sms_failed` quando o provedor está desligado.
 *
 * Diferente do genérico de propósito: neste caso **nada foi criado nem
 * alterado**, e "tente de novo em instantes" seria falso — tentar de novo vai
 * falhar igual até a clínica concluir a contratação do número. O WhatsApp
 * continua funcionando e é o caminho.
 */
export const SMS_PROVIDER_UNAVAILABLE_MESSAGE =
  'O envio por SMS ainda não está ligado. Nada foi criado nem alterado — envie os dados pelo WhatsApp.';

const KNOWN_CODES = new Set<string>(Object.keys(CAREGIVER_ERROR_MESSAGES));

interface CaregiverErrorOptions {
  /** No `sms_failed` da criação: o vínculo que nasceu mesmo assim. */
  linkId?: string | null;
  /** No `sms_failed`: até quando a senha provisória emitida vale. */
  expiresAt?: string | null;
  /** O provedor de SMS não está configurado — nada foi criado nem alterado. */
  smsProviderUnavailable?: boolean;
  cause?: unknown;
}

/** Erro de uma função do acompanhante. `code` é um `CaregiverErrorCode` quando o banco o reconhece. */
export class CaregiverError extends AppError {
  /**
   * No `sms_failed` de `create-caregiver`: o vínculo pendente que já existe.
   * `null` também no reset, que não devolve `link_id` — lá o vínculo já existia.
   */
  readonly linkId: string | null;
  /** No `sms_failed`: até quando a senha provisória vale. */
  readonly expiresAt: string | null;
  /**
   * `true` quando o servidor recusou ANTES de tocar em qualquer coisa, porque o
   * provedor de SMS não está configurado. É a diferença entre "tente de novo" e
   * "o envio por SMS ainda não está ligado" — e nada foi criado nem alterado.
   */
  readonly smsProviderUnavailable: boolean;

  constructor(message: string, code: string, options: CaregiverErrorOptions = {}) {
    super(message, code, options.cause);
    this.name = 'CaregiverError';
    this.linkId = options.linkId ?? null;
    this.expiresAt = options.expiresAt ?? null;
    this.smsProviderUnavailable = options.smsProviderUnavailable ?? false;
  }
}

/** Este texto é um código que o app conhece? */
export function isCaregiverErrorCode(code: string): code is CaregiverErrorCode {
  return KNOWN_CODES.has(code);
}

/** O código estável do erro, ou `null` se não for um erro do acompanhante que o app conheça. */
export function getCaregiverErrorCode(error: unknown): CaregiverErrorCode | null {
  if (error instanceof AppError && isCaregiverErrorCode(error.code)) return error.code;
  return null;
}

/**
 * O provedor de SMS está desligado? Só então o app pode afirmar que nada foi
 * criado — em qualquer outro `sms_failed` a senha já foi emitida.
 */
export function isSmsProviderUnavailable(error: unknown): boolean {
  return error instanceof CaregiverError && error.smsProviderUnavailable;
}

/**
 * A resposta não voltou — rede que caiu com o pedido no ar, ou o servidor que
 * não respondeu. O pedido pode ter sido cumprido do outro lado sem que o app
 * soubesse: numa criação, o acesso pode existir e a senha, que só vinha na
 * resposta, não chegou a ninguém.
 */
export function isOutcomeUnknown(error: unknown): boolean {
  return error instanceof AppError && (error.code === 'network' || error.code === '503');
}
