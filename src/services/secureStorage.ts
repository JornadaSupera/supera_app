import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Capacitor } from '@capacitor/core';
import { prepareSecureStorage } from './installState';

// Armazenamento criptografado para dado sensível (sessão, token).
//
// No app nativo empacotado pelo Capacitor isso resolve para Keychain (iOS) e
// EncryptedSharedPreferences/Keystore (Android) — criptografado em repouso,
// como o Contrato Técnico exige.
//
// ⚠️ No navegador o plugin cai para `localStorage`, que NÃO é criptografado.
// Isso é limitação da plataforma (o browser não expõe Keychain), não da
// implementação. Vale para desenvolvimento e para um eventual acesso web;
// a entrega contratada é o app nativo (Android e iOS), onde a criptografia
// de fato acontece. Use `isStorageEncrypted()` antes de decidir guardar algo
// realmente sensível fora do app nativo.
//
// Toda operação espera `prepareSecureStorage()` (`installState.ts`): numa
// instalação nova, o que sobrou de uma instalação anterior sai do cofre antes
// de qualquer leitura — é o que impede o iPhone de devolver a sessão a quem
// apagou e reinstalou o app. O cliente do Supabase lê o cofre assim que é
// criado, então a espera tem de estar aqui, e não no boot.

export function isStorageEncrypted(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Lê um valor. Devolve `null` se a chave não existe ou se o cofre não pôde ser
 * lido — falha de leitura é tratada como "não autenticado", que é o estado
 * seguro por padrão.
 */
export async function secureGet(key: string): Promise<string | null> {
  try {
    await prepareSecureStorage();
    const value = await SecureStorage.get(key);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Grava um valor. Erro é propagado de propósito: falhar em silêncio aqui
 * significaria o usuário achar que entrou e perder a sessão no próximo acesso.
 */
export async function secureSet(key: string, value: string): Promise<void> {
  await prepareSecureStorage();
  await SecureStorage.set(key, value);
}

/** Remove uma chave. Não falha se a chave já não existir. */
export async function secureRemove(key: string): Promise<void> {
  try {
    await prepareSecureStorage();
    await SecureStorage.remove(key);
  } catch {
    // Remover algo que já não está lá não é erro para quem chama.
  }
}
