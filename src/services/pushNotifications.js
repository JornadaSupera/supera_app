import { Capacitor } from '@capacitor/core';
import OneSignal, { LogLevel } from '@onesignal/capacitor-plugin';

const ONESIGNAL_APP_ID = '5bd80826-6c30-48c1-9c18-84fba50770cd';

export function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  OneSignal.Debug.setLogLevel(import.meta.env.DEV ? LogLevel.Verbose : LogLevel.Error);
  OneSignal.initialize(ONESIGNAL_APP_ID);
  OneSignal.Notifications.requestPermission(false);
}

/**
 * Associa este dispositivo ao paciente autenticado, para que o backend
 * consiga mandar notificação push direcionada a ele (via API/dashboard do
 * OneSignal, usando esse mesmo `externalId`) — não exige nenhum endpoint
 * próprio, é o mecanismo nativo do OneSignal para isso. Chamar logo após
 * login/cadastro concluído com sucesso.
 * @param {string} externalId - `patient.id` do paciente autenticado.
 */
export function identifyPushUser(externalId) {
  if (!Capacitor.isNativePlatform()) return;
  OneSignal.login(externalId).catch(() => {});
}

/**
 * Desfaz a associação do dispositivo com o paciente. Chamar no logout,
 * para não continuar direcionando notificações desse paciente a um
 * dispositivo que pode passar a ser usado por outra pessoa.
 */
export function clearPushUser() {
  if (!Capacitor.isNativePlatform()) return;
  OneSignal.logout().catch(() => {});
}
