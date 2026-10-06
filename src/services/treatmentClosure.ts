import { secureGet, secureSet } from './secureStorage';
import { parseClosureCelebrations } from '../utils/treatmentClosure';
import type { TreatmentClosureCelebration } from '../types';

// Registro, NESTE aparelho, de que a tela surpresa do sino já foi mostrada.
//
// Vai para o cofre criptografado (Keychain/Keystore), e não para o
// `localStorage`: saber que alguém teve o encerramento do tratamento marcado é
// dado de saúde, mesmo guardando só o id do compromisso. Uma chave por conta,
// para a surpresa de um paciente não silenciar a de outro no mesmo aparelho.
// Nada vai ao banco: o pacote de design pede uma vez por compromisso, e o
// banco não tem onde guardar isso.

/** Quantos registros guardar: o suficiente para algumas remarcações. */
const MAX_RECORDS = 10;

function storageKey(accountId: string): string {
  return `supera_closure_celebrated_${accountId}`;
}

/** As telas já mostradas para esta conta. Cofre ilegível vale como nenhuma. */
export async function getClosureCelebrations(accountId: string): Promise<TreatmentClosureCelebration[]> {
  return parseClosureCelebrations(await secureGet(storageKey(accountId)));
}

/** Anota que a tela deste compromisso foi vista e fechada. */
export async function saveClosureCelebration(accountId: string, appointmentId: string): Promise<void> {
  const current = await getClosureCelebrations(accountId);
  const next: TreatmentClosureCelebration[] = [
    ...current.filter((celebration) => celebration.appointmentId !== appointmentId),
    { appointmentId, shownAt: new Date().toISOString() },
  ].slice(-MAX_RECORDS);

  await secureSet(storageKey(accountId), JSON.stringify(next));
}
