import { buildWhatsAppUrl } from '../utils/caregiverMessage';

// Abrir o WhatsApp na conversa do acompanhante, com a mensagem pronta.
//
// SEMPRE `whatsapp://send`, no aparelho e na web — nunca `https://wa.me`.
// A mensagem leva a senha provisória, e um endereço `https` com o texto na
// query iria parar no histórico do navegador (inclusive o sincronizado com a
// conta Google ou Apple) e nos registros dos servidores que o atendem. O
// esquema próprio é entregue direto ao aplicativo: no aparelho, a WebView do
// Capacitor passa o endereço ao sistema (`Bridge.launchIntent` no Android,
// `UIApplication.open` no iOS); na web, o navegador o passa ao WhatsApp
// instalado. Decisão de 23/09, que agora vale para os dois lados.
//
// NINGUÉM AVISA QUANDO O WHATSAPP NÃO ABRE. No Android o Capacitor engole a
// `ActivityNotFoundException` ("TODO - trigger an event", no próprio código
// dele); no iOS e na web a falha também não volta para o JavaScript. Por isso a
// abertura é CONFIRMADA pelo que o sistema faz com o app: se outro aplicativo
// assumiu a tela, a página fica oculta ou perde o foco em instantes. Se nada
// disso acontece, o WhatsApp não abriu — e a tela diz isso, em vez de anunciar
// um envio que não houve.

/** Quanto esperar o sistema trocar de aplicativo antes de concluir que o WhatsApp não abriu. */
const APP_SWITCH_TIMEOUT_MS = 2500;

/**
 * Resolve `true` quando outro aplicativo assume a tela (a página fica oculta ou
 * a janela perde o foco) e `false` se nada disso acontece a tempo.
 *
 * `blur` entra junto de `visibilitychange` porque há casos em que o app não vai
 * para segundo plano mas perde o foco: o seletor do Android quando há WhatsApp
 * e WhatsApp Business, ou o "Abrir o WhatsApp?" do navegador no computador.
 * Nos dois, o sistema atendeu o pedido — só falta a pessoa escolher.
 */
function waitForAppSwitch(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (switched: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('pagehide', onLeave);
      resolve(switched);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') finish(true);
    };
    const onLeave = () => finish(true);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onLeave);
    window.addEventListener('pagehide', onLeave);
    const timer = window.setTimeout(() => finish(false), timeoutMs);
  });
}

/**
 * Abre a conversa do número com o texto pronto e diz se o WhatsApp abriu.
 *
 * A pessoa ainda toca em "enviar" dentro do WhatsApp: nenhum aplicativo manda
 * mensagem em nome de outra pessoa, e é bom que seja assim.
 *
 * `false` quer dizer que nada assumiu a tela: WhatsApp não instalado, ou o
 * sistema recusou abrir. Quem chama mostra o aviso com o reenvio — a senha
 * desta mensagem não chegou a ninguém.
 */
export function openWhatsAppChat(phoneE164: string, text: string): Promise<boolean> {
  // Os ouvintes entram ANTES da navegação: a troca de aplicativo pode acontecer
  // antes da próxima linha rodar.
  const switched = waitForAppSwitch(APP_SWITCH_TIMEOUT_MS);
  window.location.assign(buildWhatsAppUrl(phoneE164, text));
  return switched;
}
