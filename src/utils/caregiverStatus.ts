import { formatDateTimeBr } from './date';
import type { MyCaregiver } from '../types';

/**
 * Em que ponto está o acompanhante do titular, para o cartão de "Meu
 * acompanhante" e para o resumo no Perfil dizerem a mesma coisa.
 *
 * O ponto de partida é o ESTADO DO VÍNCULO, e não uma marca no token: o banco
 * decidiu assim (guia §5.2) e todo predicado do sistema filtra
 * `status = 'active'`. `pending` é o vínculo cuja senha provisória ainda não
 * foi trocada — e, enquanto ele é `pending`, **o acompanhante entra no app e
 * não lê absolutamente nada** do titular.
 *
 * - `waiting`: vínculo `pending` com senha provisória dentro da validade.
 * - `expired`: vínculo `pending` e a senha provisória venceu; só uma nova
 *   senha destrava.
 * - `active`: trocou a senha provisória e o acesso está valendo.
 */
export type CaregiverStatusTone = 'active' | 'waiting' | 'expired';

export interface CaregiverStatus {
  tone: CaregiverStatusTone;
  label: string;
  /** Uma frase que explica a situação e o que o titular pode fazer. */
  note: string;
  /** Há senha provisória em aberto? É o que decide se "Gerar nova senha" aparece. */
  awaitingFirstAccess: boolean;
}

export function getCaregiverStatus(caregiver: MyCaregiver, now: number = Date.now()): CaregiverStatus {
  const awaitingFirstAccess = caregiver.status === 'pending';

  if (!awaitingFirstAccess) {
    return {
      tone: 'active',
      label: 'Ativo',
      note: caregiver.activatedAt
        ? `Primeiro acesso concluído em ${formatDateTimeBr(caregiver.activatedAt)}.`
        : 'Primeiro acesso concluído: a senha provisória já foi trocada.',
      awaitingFirstAccess: false,
    };
  }

  const expiresAt = caregiver.temporaryPasswordExpiresAt;
  const isExpired = expiresAt !== null && new Date(expiresAt).getTime() < now;

  if (isExpired) {
    return {
      tone: 'expired',
      label: 'Senha provisória vencida',
      note: 'A senha provisória venceu. Gere uma nova para o acompanhante conseguir entrar.',
      awaitingFirstAccess: true,
    };
  }

  return {
    tone: 'waiting',
    label: 'Aguardando o primeiro acesso',
    note: expiresAt
      ? `Enquanto não trocar a senha, esta pessoa não vê nenhum dado seu. A senha provisória vale até ${formatDateTimeBr(expiresAt)}.`
      : 'Enquanto não trocar a senha provisória, esta pessoa não vê nenhum dado seu.',
    awaitingFirstAccess: true,
  };
}
