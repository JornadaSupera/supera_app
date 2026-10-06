// Tipos da atualização do app pelas lojas. Sem banco: quem diz se há versão
// nova é a loja do aparelho — a Google Play no Android, a App Store no iPhone.

/** A loja de onde o app foi instalado, pelo sistema do aparelho. */
export type AppStoreName = 'Google Play' | 'App Store';

/** Uma versão do app mais nova que a instalada, já publicada na loja do aparelho. */
export interface StoreUpdate {
  /**
   * Identifica a versão nova, para o "Atualizar depois" valer só para ela: o
   * número da versão no iPhone, o código da versão no Android.
   */
  version: string;
  store: AppStoreName;
}

/** O "Atualizar depois" de uma versão, guardado neste aparelho. */
export interface AppUpdateSnooze {
  version: string;
  /** Até quando a tela não volta para esta versão, em ms desde 1970. */
  until: number;
}
