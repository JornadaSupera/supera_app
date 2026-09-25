import { CaregiverError, getCaregiverErrorCode } from '../../lib/caregiverError';
import type { CaregiverHandoff } from '../../stores/caregiverHandoffStore';
import type { CaregiverAccess, CaregiverDelivery } from '../../types';

/** Os dados do acompanhante que a tela de envio precisa e que não mudam entre uma senha e outra. */
export interface HandoffBase {
  fullName: string;
  email: string;
  /** E.164. */
  phone: string;
}

/** A entrega depois de criar (ou gerar outra senha) com sucesso. */
export function handoffFromAccess(base: HandoffBase, delivery: CaregiverDelivery, access: CaregiverAccess): CaregiverHandoff {
  return {
    ...base,
    delivery,
    temporaryPassword: access.temporaryPassword,
    expiresAt: access.expiresAt,
    smsFailed: false,
  };
}

/**
 * A entrega quando o servidor criou a conta mas o SMS não saiu: a conta
 * existe, não há senha para mostrar, e a tela oferece gerar outra. `null` para
 * qualquer outro erro — esses ficam com quem chamou.
 */
export function handoffFromSmsFailure(base: HandoffBase, error: unknown): CaregiverHandoff | null {
  if (getCaregiverErrorCode(error) !== 'sms_failed') return null;

  return {
    ...base,
    delivery: 'sms',
    temporaryPassword: null,
    expiresAt: error instanceof CaregiverError ? (error.expiresAt ?? '') : '',
    smsFailed: true,
  };
}
