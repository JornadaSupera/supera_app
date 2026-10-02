import { Capacitor } from '@capacitor/core';
import type * as AppUpdateSdk from '@capawesome/capacitor-app-update';
import { APP_STORE_ID } from '../lib/features';
import type { AppStoreName, StoreUpdate } from '../types';

// Versão nova nas lojas — `@capawesome/capacitor-app-update`, o equivalente
// do `upgrader`/`in_app_update` do Flutter.
//
// Cada sistema pergunta à sua loja:
// - **Android:** a Google Play, pelo Play Core. Só responde no app instalado
//   PELA loja (inclusive o teste interno); instalado pelo Android Studio, a
//   Play não o reconhece e não há o que comparar.
// - **iPhone:** a busca pública da App Store pelo identificador do app, no
//   catálogo do Brasil. Para abrir a página do app, a loja precisa do Apple ID
//   (`APP_STORE_ID`, em `lib/features.ts`).
//
// Na Web não há loja: nada é perguntado.

type AppUpdateModule = typeof AppUpdateSdk;

/** O mesmo carregamento sob demanda do push: o plugin fica fora do bundle da Web. */
let appUpdateModulePromise: Promise<AppUpdateModule> | null = null;

function loadAppUpdate(): Promise<AppUpdateModule> {
  if (!appUpdateModulePromise) {
    appUpdateModulePromise = import('@capawesome/capacitor-app-update');
  }
  return appUpdateModulePromise;
}

/** O catálogo da App Store onde o app é publicado. */
const APP_STORE_COUNTRY = 'br';

function isIos(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

function storeName(): AppStoreName {
  return isIos() ? 'App Store' : 'Google Play';
}

/**
 * A versão nova publicada na loja deste aparelho, ou `null` quando não há —
 * inclusive na Web.
 *
 * @throws quando a loja não responde (sem internet, app fora da Play); quem
 * chama trata como "sem atualização".
 */
export async function getStoreUpdate(): Promise<StoreUpdate | null> {
  if (!Capacitor.isNativePlatform()) return null;

  const { AppUpdate, AppUpdateAvailability } = await loadAppUpdate();
  const info = await AppUpdate.getAppUpdateInfo({ country: APP_STORE_COUNTRY });

  if (info.updateAvailability !== AppUpdateAvailability.UPDATE_AVAILABLE) return null;

  // O iPhone diz o número da versão; o Android, só o código dela.
  const version = info.availableVersionName ?? info.availableVersionCode;
  if (!version) return null;

  return { version, store: storeName() };
}

/**
 * Abre a página do app na loja deste aparelho, onde a pessoa toca em
 * "Atualizar". No Android, o próprio pacote do app; no iPhone, o Apple ID.
 */
export async function openStorePage(): Promise<void> {
  const { AppUpdate } = await loadAppUpdate();

  await AppUpdate.openAppStore(isIos() ? { appId: APP_STORE_ID } : undefined);
}
