import { Capacitor } from '@capacitor/core';

const ONESIGNAL_APP_ID = '5bd80826-6c30-48c1-9c18-84fba50770cd';

/**
 * Fora do Capacitor nativo, o SDK do OneSignal não faz nada além de existir
 * no bundle — o import estático colocava a integração inteira no chunk
 * inicial também da build Web. Carregar sob demanda, só depois do guard de
 * `isNativePlatform()`, tira o SDK do caminho crítico do navegador.
 * `oneSignalModulePromise` garante que o `import()` só dispara uma vez.
 */
let oneSignalModulePromise = null;

function loadOneSignal() {
  if (!oneSignalModulePromise) {
    oneSignalModulePromise = import('@onesignal/capacitor-plugin');
  }
  return oneSignalModulePromise;
}

export function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  loadOneSignal()
    .then(({ default: OneSignal, LogLevel }) => {
      OneSignal.Debug.setLogLevel(import.meta.env.DEV ? LogLevel.Verbose : LogLevel.Error);
      OneSignal.initialize(ONESIGNAL_APP_ID);
      OneSignal.Notifications.requestPermission(false);
    })
    .catch(() => {});
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
 * Chamada a partir de um único lugar — `syncPushIdentity` em
 * `stores/sessionStore.ts` — sempre que a identidade da sessão transiciona
 * para uma conta diferente da anterior. Não chamar diretamente das telas.
 * @param {string} accountId
 */
export function identifyPushUser(accountId) {
  if (!Capacitor.isNativePlatform()) return;
  loadOneSignal()
    .then(({ default: OneSignal }) => OneSignal.login(accountId))
    .catch(() => {});
}

/**
 * Desfaz a associação do dispositivo com a conta. Chamada a partir do mesmo
 * coordenador central (`syncPushIdentity` em `stores/sessionStore.ts`) em
 * toda transição para estado anônimo — logout explícito, em qualquer tela,
 * e encerramento de sessão vindo do servidor (revogação, expiração de
 * MFA) — para não continuar direcionando notificações a um dispositivo que
 * pode passar a ser usado por outra pessoa. Não chamar diretamente das
 * telas.
 */
export function clearPushUser() {
  if (!Capacitor.isNativePlatform()) return;
  loadOneSignal()
    .then(({ default: OneSignal }) => OneSignal.logout())
    .catch(() => {});
}
