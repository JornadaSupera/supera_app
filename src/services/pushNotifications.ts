import { Capacitor } from '@capacitor/core';
import type * as OneSignalSdk from '@onesignal/capacitor-plugin';
import type { PushOpen } from '../types';

const ONESIGNAL_APP_ID = '5bd80826-6c30-48c1-9c18-84fba50770cd';

type OneSignalModule = typeof OneSignalSdk;

/**
 * Fora do Capacitor nativo, o SDK do OneSignal não faz nada além de existir
 * no bundle — o import estático colocava a integração inteira no chunk
 * inicial também da build Web. Carregar sob demanda, só depois do guard de
 * `isNativePlatform()`, tira o SDK do caminho crítico do navegador.
 * `oneSignalModulePromise` garante que o `import()` só dispara uma vez.
 */
let oneSignalModulePromise: Promise<OneSignalModule> | null = null;

function loadOneSignal(): Promise<OneSignalModule> {
  if (!oneSignalModulePromise) {
    oneSignalModulePromise = import('@onesignal/capacitor-plugin');
  }
  return oneSignalModulePromise;
}

/**
 * Roda `action` com o SDK carregado — só no app nativo; na Web devolve
 * `undefined` sem carregar nada. Falha do SDK nunca chega a quem chamou: push
 * é acessório, e login ou logout não podem quebrar por causa dele.
 */
export function withOneSignal<T>(
  action: (sdk: OneSignalModule) => T | Promise<T>
): Promise<T | undefined> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(undefined);

  return loadOneSignal()
    .then(action)
    .catch(() => undefined);
}

export function initPushNotifications(): void {
  void withOneSignal(({ default: OneSignal, LogLevel }) => {
    OneSignal.Debug.setLogLevel(import.meta.env.DEV ? LogLevel.Verbose : LogLevel.Error);
    OneSignal.initialize(ONESIGNAL_APP_ID);
    OneSignal.Notifications.requestPermission(false);
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Só UUID passa: o ID vira pedaço de rota, e nada de fora do formato entra nela. */
function readId(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

/** O `data` que a `send-push` manda, conferido campo a campo. */
function readPushOpen(data: unknown): PushOpen | null {
  if (!data || typeof data !== 'object') return null;

  const record = data as Record<string, unknown>;
  return {
    notificationId: readId(record.notification_id),
    targetTable: typeof record.target_table === 'string' ? record.target_table : null,
    targetId: readId(record.target_id),
  };
}

/**
 * Ouve o toque num push. Chamar no boot, antes do primeiro render: com o app
 * fechado, é o toque que o abre, e o SDK guarda esse toque até alguém se
 * registrar para ouvi-lo. Quem decide para onde ir (e quando) é quem recebe.
 */
export function onPushOpened(handler: (open: PushOpen) => void): void {
  void withOneSignal(({ default: OneSignal }) => {
    OneSignal.Notifications.addEventListener('click', (event) => {
      const open = readPushOpen(event.notification.additionalData);
      if (open) handler(open);
    });
  });
}

/**
 * Associa este dispositivo à conta autenticada (`accounts.id` /
 * `auth.uid()`), para que o backend consiga mandar notificação push
 * direcionada a ela (via API/dashboard do OneSignal, usando esse mesmo
 * `externalId`) — não exige nenhum endpoint próprio, é o mecanismo nativo do
 * OneSignal para isso.
 *
 * É a conta, e não o paciente: a conta é o identificador estável (existe
 * antes de qualquer vínculo com `patients`, e não muda se o vínculo mudar
 * ou for desfeito), e o push não precisa carregar identidade clínica.
 *
 * Chamada a partir de um único lugar — `handleIdentityChange` em
 * `stores/sessionStore.ts` — sempre que a identidade da sessão transiciona
 * para uma conta diferente da anterior. Não chamar diretamente das telas.
 */
export function identifyPushUser(accountId: string): void {
  void withOneSignal(({ default: OneSignal }) => OneSignal.login(accountId));
}

/**
 * Desfaz a associação do dispositivo com a conta. Chamada a partir do mesmo
 * coordenador central (`handleIdentityChange` em `stores/sessionStore.ts`) em
 * toda transição para estado anônimo — logout explícito, em qualquer tela,
 * e encerramento de sessão vindo do servidor (revogação, expiração de
 * MFA) — para não continuar direcionando notificações a um dispositivo que
 * pode passar a ser usado por outra pessoa. Não chamar diretamente das
 * telas.
 */
export function clearPushUser(): void {
  void withOneSignal(({ default: OneSignal }) => OneSignal.logout());
}
