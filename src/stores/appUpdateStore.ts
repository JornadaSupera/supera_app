import { create } from 'zustand';
import { parseSnooze, snoozeUntil } from '../utils/appUpdate';
import type { AppUpdateSnooze } from '../types';

// O "Atualizar depois" deste aparelho. `localStorage` porque não é dado de
// ninguém: só a versão adiada e até quando. Sobrevive a fechar o app — senão
// a tela voltaria a cada abertura, e "depois" viraria "daqui a pouco".

const SNOOZE_STORAGE_KEY = 'supera_update_snooze';

interface AppUpdateState {
  snooze: AppUpdateSnooze | null;
  snoozeVersion: (version: string) => void;
}

/** `localStorage` pode lançar (WebView sem storage, cota cheia): vale como nenhum adiamento. */
function readSnooze(): AppUpdateSnooze | null {
  try {
    return parseSnooze(localStorage.getItem(SNOOZE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export const useAppUpdateStore = create<AppUpdateState>((set) => ({
  snooze: readSnooze(),

  snoozeVersion: (version) => {
    const snooze = snoozeUntil(version);
    try {
      localStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify(snooze));
    } catch {
      // Sem persistência: o adiamento vale até o app fechar.
    }
    set({ snooze });
  },
}));
