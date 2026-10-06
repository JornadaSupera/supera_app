import { Capacitor, SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core';
import type { SystemBarTone } from '../utils/systemBarTone';

// As barras do sistema do aparelho: a de status (relógio, bateria) e, no
// Android, a de navegação. O app desenha por baixo delas, e a cor dos ícones
// precisa acompanhar o fundo da tela. Só existe no app nativo: no navegador é
// a página que não alcança as barras.

export type SystemBar = 'status' | 'navigation';

/**
 * Ícones claros sobre fundo escuro, escuros sobre fundo claro. Falha aqui não
 * é erro para a pessoa: o ícone só fica com a cor que já tinha.
 */
export async function setSystemBarStyle(bar: SystemBar, backgroundTone: SystemBarTone): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  await SystemBars.setStyle({
    style: backgroundTone === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
    bar: bar === 'status' ? SystemBarType.StatusBar : SystemBarType.NavigationBar,
  }).catch(() => undefined);
}

/** Se há barras do sistema para acompanhar (só no app nativo). */
export function hasSystemBars(): boolean {
  return Capacitor.isNativePlatform();
}
