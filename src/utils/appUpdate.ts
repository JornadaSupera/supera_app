import type { AppUpdateSnooze } from '../types';

// Regras puras da tela de atualização — sem acesso à loja, por isso aqui e não
// em `services/`.

/** Por quanto tempo o "Atualizar depois" segura a tela, em horas. */
export const UPDATE_SNOOZE_HOURS = 24;

const SNOOZE_MS = UPDATE_SNOOZE_HOURS * 60 * 60 * 1000;

/** O "Atualizar depois" desta versão, contado a partir de agora. */
export function snoozeUntil(version: string, now: number = Date.now()): AppUpdateSnooze {
  return { version, until: now + SNOOZE_MS };
}

/**
 * A tela está adiada para esta versão? Só para a MESMA versão e dentro do
 * prazo: saindo uma versão mais nova, ela volta na hora.
 */
export function isUpdateSnoozed(
  snooze: AppUpdateSnooze | null,
  version: string,
  now: number = Date.now()
): boolean {
  return snooze !== null && snooze.version === version && now < snooze.until;
}

/**
 * Lê o adiamento guardado no aparelho. O que não tiver o formato (gravado à
 * mão, corrompido) vale como nenhum: o pior caso é a tela aparecer de novo.
 */
export function parseSnooze(raw: string | null): AppUpdateSnooze | null {
  if (!raw) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;

    const { version, until } = value as Record<string, unknown>;
    if (typeof version !== 'string' || typeof until !== 'number') return null;

    return { version, until };
  } catch {
    return null;
  }
}
