import { AppError } from './appError';
import type { CaregiverErrorCode } from '../types';

// O erro das funções do acompanhante e o texto de cada código.
//
// Mora em `lib/` (e não em `services/`) porque as telas precisam reconhecer o
// `sms_failed` e ler a conta que foi criada mesmo com o erro, e páginas não
// importam de `services/`.

/** Texto pronto para a tela, por código estável do banco (item 30 do PENDENCIAS_BANCO.md). */
export const CAREGIVER_ERROR_MESSAGES: Record<CaregiverErrorCode, string> = {
  not_patient_owner: 'Só o titular da conta pode gerenciar o acompanhante.',
  caregiver_already_active: 'Você já tem um acompanhante. Revogue o acesso dele para adicionar outro.',
  email_in_use: 'Este e-mail já está em uso em outra conta. Use outro e-mail.',
  invalid_phone: 'Informe um celular com DDD válido.',
  sms_failed: 'O acesso foi criado, mas o SMS não saiu. Gere uma nova senha e tente de novo.',
  no_active_caregiver: 'Você não tem um acompanhante ativo.',
  weak_password: 'Essa senha é fraca demais. Escolha uma mais forte.',
  password_unchanged: 'A nova senha precisa ser diferente da senha provisória.',
  not_first_login: 'Esta conta já trocou a senha provisória.',
  temporary_password_expired: 'A senha provisória venceu. Peça uma nova a quem cadastrou você.',
  unavailable: 'Este recurso ainda não está disponível. Fale com a recepção do Centro.',
  incomplete_response:
    'O servidor respondeu de um jeito inesperado. Em "Meu acompanhante", confira se o acesso foi criado e, se preciso, gere uma nova senha.',
};

const KNOWN_CODES = new Set<string>(Object.keys(CAREGIVER_ERROR_MESSAGES));

/** Erro de uma função do acompanhante. `code` é um `CaregiverErrorCode` quando o banco o reconhece. */
export class CaregiverError extends AppError {
  /** No `sms_failed`: a conta que foi criada mesmo assim. */
  readonly caregiverAccountId: string | null;
  /** No `sms_failed`: até quando a senha provisória vale. */
  readonly expiresAt: string | null;

  constructor(
    message: string,
    code: string,
    options: { caregiverAccountId?: string | null; expiresAt?: string | null; cause?: unknown } = {}
  ) {
    super(message, code, options.cause);
    this.name = 'CaregiverError';
    this.caregiverAccountId = options.caregiverAccountId ?? null;
    this.expiresAt = options.expiresAt ?? null;
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
