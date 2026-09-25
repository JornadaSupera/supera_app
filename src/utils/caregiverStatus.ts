import { formatDateTimeBr } from './date';
import type { MyCaregiver } from '../types';

/**
 * Em que ponto está o acompanhante do titular, para o cartão de "Meu
 * acompanhante" e para o resumo no Perfil dizerem a mesma coisa.
 *
 * - `waiting`: a conta existe, mas a senha provisória ainda não foi trocada.
 * - `expired`: a senha provisória passou da validade sem ser trocada; o
 *   acompanhante não entra até o titular gerar outra.
 * - `active`: já trocou a senha provisória.
 */
export type CaregiverStatusTone = 'active' | 'waiting' | 'expired';

export interface CaregiverStatus {
  tone: CaregiverStatusTone;
  label: string;
  /** Uma frase que explica a situação e o que o titular pode fazer. */
  note: string;
}

export function getCaregiverStatus(caregiver: MyCaregiver, now: number = Date.now()): CaregiverStatus {
  const expiresAt = caregiver.temporaryPasswordExpiresAt;
  const isExpired = caregiver.passwordIsTemporary && expiresAt !== null && new Date(expiresAt).getTime() < now;

  if (isExpired) {
    return {
      tone: 'expired',
      label: 'Senha provisória vencida',
      note: 'A senha provisória venceu. Gere uma nova para o acompanhante conseguir entrar.',
    };
  }

  if (caregiver.passwordIsTemporary) {
    return {
      tone: 'waiting',
      label: 'Aguardando o primeiro acesso',
      note: expiresAt
        ? `A senha provisória vale até ${formatDateTimeBr(expiresAt)}.`
        : 'O acompanhante ainda não trocou a senha provisória.',
    };
  }

  return {
    tone: 'active',
    label: 'Ativo',
    note: 'Primeiro acesso concluído: a senha provisória já foi trocada.',
  };
}
