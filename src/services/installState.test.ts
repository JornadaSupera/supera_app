import { beforeEach, describe, expect, it, vi } from 'vitest';

// Os plugins nativos são simulados: cada chamada entra em `calls`, na ordem.
const state = vi.hoisted(() => ({
  calls: [] as string[],
  native: true,
  markerExists: false,
  clearFails: false,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => state.native },
}));

vi.mock('@capacitor/filesystem', () => ({
  Directory: { LibraryNoCloud: 'LIBRARY_NO_CLOUD' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    stat: async () => {
      state.calls.push('stat');
      if (!state.markerExists) throw new Error('File does not exist.');
      return {};
    },
    writeFile: async () => {
      state.calls.push('writeFile');
      state.markerExists = true;
      return { uri: 'install-marker' };
    },
  },
}));

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  KeychainAccess: { whenUnlockedThisDeviceOnly: 1 },
  SecureStorage: {
    setDefaultKeychainAccess: async () => {
      state.calls.push('access');
    },
    clear: async () => {
      state.calls.push('clear');
      if (state.clearFails) throw new Error('Keychain indisponível.');
    },
    get: async () => {
      state.calls.push('get');
      return 'sessao-da-instalacao-anterior';
    },
    set: async () => {
      state.calls.push('set');
    },
    remove: async () => {
      state.calls.push('remove');
      return true;
    },
  },
}));

beforeEach(() => {
  // Cada teste é uma abertura do app: módulo novo, sem a promessa guardada.
  vi.resetModules();
  state.calls = [];
  state.native = true;
  state.markerExists = false;
  state.clearFails = false;
});

describe('prepareSecureStorage', () => {
  it('numa instalação nova, esvazia o cofre e só depois grava a marca', async () => {
    const { prepareSecureStorage } = await import('./installState');
    await prepareSecureStorage();
    expect(state.calls).toEqual(['access', 'stat', 'clear', 'writeFile']);
  });

  it('com a marca presente (mesma instalação), não mexe no cofre', async () => {
    state.markerExists = true;
    const { prepareSecureStorage } = await import('./installState');
    await prepareSecureStorage();
    expect(state.calls).toEqual(['access', 'stat']);
  });

  it('roda uma vez por abertura, mesmo com chamadas simultâneas', async () => {
    const { prepareSecureStorage } = await import('./installState');
    await Promise.all([prepareSecureStorage(), prepareSecureStorage()]);
    await prepareSecureStorage();
    expect(state.calls.filter((call) => call === 'clear')).toHaveLength(1);
  });

  it('na Web não faz nada', async () => {
    state.native = false;
    const { prepareSecureStorage } = await import('./installState');
    await prepareSecureStorage();
    expect(state.calls).toEqual([]);
  });

  it('se esvaziar falhar, não grava a marca: a próxima abertura tenta de novo', async () => {
    state.clearFails = true;
    const { prepareSecureStorage } = await import('./installState');
    await expect(prepareSecureStorage()).rejects.toThrow();
    expect(state.calls).not.toContain('writeFile');
  });
});

describe('cofre (secureStorage)', () => {
  it('só lê depois de esvaziar o que sobrou da instalação anterior', async () => {
    const { secureGet } = await import('./secureStorage');
    await secureGet('sb-auth-token');
    expect(state.calls).toEqual(['access', 'stat', 'clear', 'writeFile', 'get']);
  });

  it('com o cofre indisponível, a leitura devolve "sem sessão" sem ler nada', async () => {
    state.clearFails = true;
    const { secureGet } = await import('./secureStorage');
    await expect(secureGet('sb-auth-token')).resolves.toBeNull();
    expect(state.calls).not.toContain('get');
  });

  it('com o cofre indisponível, gravar falha em vez de fingir que guardou', async () => {
    state.clearFails = true;
    const { secureSet } = await import('./secureStorage');
    await expect(secureSet('sb-auth-token', 'nova')).rejects.toThrow();
    expect(state.calls).not.toContain('set');
  });
});
