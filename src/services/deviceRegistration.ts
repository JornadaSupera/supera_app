import { Capacitor } from '@capacitor/core';
import { withOneSignal } from './pushNotifications';
import { supabase } from './supabaseClient';
import type { DevicePlatform } from '../types';

// Registro do aparelho em `device_tokens` (guia do banco, seção 5.8).
//
// O token é o ID de inscrição do OneSignal: é por ele que o consumidor da fila
// de push entrega. O registro é por conta, não por paciente — pelo mesmo
// motivo de `identifyPushUser`, a notificação vai para quem está logado.
//
// Tudo aqui é melhor-esforço e nunca lança. Sem registro o paciente só deixa
// de receber push, e isso não pode travar login nem logout. Por isso o erro
// das RPCs é ignorado de propósito: a próxima abertura com sessão tenta de
// novo.

/** Quanto o logout espera o cancelamento antes de seguir sem ele. */
const UNREGISTER_TIMEOUT_MS = 3000;

function nativePlatform(): DevicePlatform | null {
  const platform = Capacitor.getPlatform();
  return platform === 'ios' || platform === 'android' ? platform : null;
}

async function readSubscriptionId(): Promise<string | null> {
  const id = await withOneSignal(({ default: OneSignal }) =>
    OneSignal.User.pushSubscription.getIdAsync()
  );
  return id ?? null;
}

/**
 * `register_device_token` reatribui o token a quem o apresenta, reativa e
 * atualiza `last_seen_at` — chamar de novo é seguro.
 */
async function registerToken(token: string): Promise<void> {
  const platform = nativePlatform();
  if (!supabase || !platform) return;
  await supabase.rpc('register_device_token', { p_token: token, p_platform: platform });
}

async function unregisterToken(token: string): Promise<void> {
  if (!supabase) return;
  await supabase.rpc('unregister_device_token', { p_token: token });
}

/**
 * Registra este aparelho para a conta da sessão. Chamar só com conta ativa:
 * `set_account_active` desliga os aparelhos da conta desativada, e registrar
 * de novo religaria o push dela.
 */
export async function registerCurrentDevice(): Promise<void> {
  try {
    const token = await readSubscriptionId();
    // Sem ID ainda (a permissão acabou de ser pedida): `watchPushSubscription`
    // registra quando ele chegar.
    if (token) await registerToken(token);
  } catch {
    // Melhor-esforço (ver o topo do arquivo).
  }
}

/**
 * Desativa este aparelho para a conta da sessão. Chamar **antes** do
 * `signOut`: a RPC exige `auth.uid()`, que some junto com a sessão. Espera no
 * máximo `UNREGISTER_TIMEOUT_MS` — sair do app não pode depender da rede.
 */
export async function unregisterCurrentDevice(): Promise<void> {
  const unregister = async () => {
    const token = await readSubscriptionId();
    if (token) await unregisterToken(token);
  };
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, UNREGISTER_TIMEOUT_MS));

  try {
    await Promise.race([unregister(), timeout]);
  } catch {
    // Nunca impede o logout. Na pior hipótese o aparelho segue ativo até outra
    // conta entrar nele (a RPC reatribui o token) ou a conta ser desativada.
  }
}

/**
 * Mantém o registro em dia quando o OneSignal cria ou troca a inscrição do
 * aparelho: o ID costuma chegar só depois da permissão de notificação, e muda
 * se o app for reinstalado. Chamar uma vez no boot, depois de
 * `initPushNotifications`.
 *
 * @param hasActiveAccount Diz se há conta ativa na sessão naquele instante.
 */
export function watchPushSubscription(hasActiveAccount: () => boolean): void {
  void withOneSignal(({ default: OneSignal }) => {
    OneSignal.User.pushSubscription.addEventListener('change', ({ previous, current }) => {
      if (!hasActiveAccount()) return;

      // A inscrição antiga morreu com a troca; tirá-la evita entrega em vão.
      if (previous.id && previous.id !== current.id) void unregisterToken(previous.id);
      if (current.id) void registerToken(current.id);
    });
  });
}
