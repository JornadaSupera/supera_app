import { secureGet, secureRemove, secureSet } from './secureStorage';

// Sessão do paciente autenticado. O marcador de sessão fica em armazenamento
// criptografado (Keychain/Keystore via secureStorage.ts) — nunca em
// localStorage, porque é dado sensível de um app de saúde.
//
// Todas as funções são assíncronas porque o cofre nativo é assíncrono. Quem
// consome precisa tratar o estado "verificando" (ver RequireAuth.tsx).
//
// Quando a autenticação passar a ser via Supabase Auth (ver supabaseClient.ts),
// este arquivo deixa de guardar sessão por conta própria — o Supabase gerencia
// a sessão dele mesmo, com refresh de token automático, persistida pelo mesmo
// storage criptografado. `login`/`logout`/`isAuthenticated`/`getToken` viram
// wrappers finos sobre `supabase.auth.signInWithPassword`/`signOut`/
// `getSession`. As assinaturas já são assíncronas, então essa troca não vai
// exigir mexer de novo nos call-sites.

const SESSION_KEY = 'supera_session';

/**
 * Apaga o token que as versões anteriores gravavam em `localStorage` sem
 * criptografia. Sem isso, quem já usou o app continuaria com o token antigo
 * em texto claro no aparelho para sempre — o armazenamento novo usa outra
 * chave (`capacitor-storage_supera_session`), então o valor velho nunca seria
 * sobrescrito nem lido. Chamar uma vez no boot; é barato e idempotente.
 */
export function clearLegacyPlaintextSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // WebView sem localStorage disponível: não há legado para limpar.
  }
}

export async function login(token = 'mock-session-token'): Promise<void> {
  await secureSet(SESSION_KEY, token);
}

export async function logout(): Promise<void> {
  await secureRemove(SESSION_KEY);
}

export async function isAuthenticated(): Promise<boolean> {
  return Boolean(await secureGet(SESSION_KEY));
}

export async function getToken(): Promise<string | null> {
  return secureGet(SESSION_KEY);
}
