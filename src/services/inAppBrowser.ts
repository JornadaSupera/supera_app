import { Browser } from '@capacitor/browser';

/**
 * Abre um endereço na janela de navegação do próprio app: no iOS é a folha do
 * Safari por cima do app, no Android a aba personalizada do Chrome — as duas
 * com botão de fechar, e a pessoa volta ao mesmo ponto, sem sair do app.
 *
 * Existe porque os documentos legais moram em páginas do painel que recusam
 * ser embutidas numa moldura (`X-Frame-Options`), então esta é a forma de ler
 * dentro do app. Na web (desenvolvimento) o plugin cai numa aba nova.
 *
 * Se a janela do app falhar, abre como link comum: melhor ler fora do app do
 * que não ler.
 */
export async function openInAppBrowser(url: string): Promise<void> {
  try {
    await Browser.open({ url });
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
