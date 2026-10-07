import { create } from 'zustand';

// Preferências DESTE APARELHO — sem tabela no banco (ver a nota em
// `types/patient.ts`). `localStorage` porque não é PII: é só o toggle
// visual/de atalho.
//
// Fica em Zustand, e não em `useState` local de `ProfileHub`, porque
// `main.tsx` também precisa do tema para pintar `data-theme` antes do
// primeiro render — duas leituras independentes de `localStorage` (uma no
// boot, outra no componente) são exatamente o estado espalhado que a regra
// "Zustand para estado de cliente" existe para evitar. Com a store, as duas
// leituras viram uma só: `main.tsx` lê `getState()` uma vez no boot,
// `ProfileHub` assina via hook, e os dois nunca divergem entre si.

const THEME_STORAGE_KEY = 'supera_tema';
const BIOMETRIA_STORAGE_KEY = 'supera_biometria';

interface DevicePreferencesState {
  darkTheme: boolean;
  biometriaAtiva: boolean;
  /**
   * A pessoa já respondeu sobre a biometria neste aparelho — ligou ou desligou,
   * no Perfil ou na caixinha da Início. Enquanto não respondeu, a Início
   * oferece o atalho.
   */
  biometricChoiceMade: boolean;
  setDarkTheme: (valor: boolean) => void;
  setBiometriaAtiva: (valor: boolean) => void;
}

/**
 * `localStorage` pode lançar (modo privado, cota estourada, WebView sem
 * storage) — nesses casos a preferência simplesmente não persiste entre
 * sessões, o que é aceitável para um toggle de aparelho; não é motivo para
 * derrubar a tela.
 */
function lerBooleanoArmazenado(chave: string, valorVerdadeiro: string): boolean {
  try {
    return localStorage.getItem(chave) === valorVerdadeiro;
  } catch {
    return false;
  }
}

/** Se a chave já foi gravada, com qualquer valor. Sem `localStorage`, "não". */
function hasStoredValue(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function gravarBooleano(chave: string, valor: boolean, valorVerdadeiro: string, valorFalso: string): void {
  try {
    localStorage.setItem(chave, valor ? valorVerdadeiro : valorFalso);
  } catch {
    // Sem persistência disponível: a store em memória continua correta pelo
    // resto da sessão, só não sobrevive a um reload.
  }
}

export const useDevicePreferencesStore = create<DevicePreferencesState>((set) => ({
  darkTheme: lerBooleanoArmazenado(THEME_STORAGE_KEY, 'dark'),
  biometriaAtiva: lerBooleanoArmazenado(BIOMETRIA_STORAGE_KEY, 'ativa'),
  // Desligar também grava ("inativa"): a chave vazia é quem nunca respondeu.
  biometricChoiceMade: hasStoredValue(BIOMETRIA_STORAGE_KEY),

  setDarkTheme: (valor) => {
    if (valor) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    gravarBooleano(THEME_STORAGE_KEY, valor, 'dark', 'light');
    set({ darkTheme: valor });
  },

  setBiometriaAtiva: (valor) => {
    gravarBooleano(BIOMETRIA_STORAGE_KEY, valor, 'ativa', 'inativa');
    set({ biometriaAtiva: valor, biometricChoiceMade: true });
  },
}));
