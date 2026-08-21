import { Capacitor } from '@capacitor/core';
import OneSignal, { LogLevel } from '@onesignal/capacitor-plugin';

const ONESIGNAL_APP_ID = '5bd80826-6c30-48c1-9c18-84fba50770cd';

export function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  OneSignal.Debug.setLogLevel(import.meta.env.DEV ? LogLevel.Verbose : LogLevel.Error);
  OneSignal.initialize(ONESIGNAL_APP_ID);
  OneSignal.Notifications.requestPermission(false);
}
