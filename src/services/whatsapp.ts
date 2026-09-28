import { Capacitor } from '@capacitor/core';
import { buildWhatsAppAppUrl, buildWhatsAppWebUrl } from '../utils/caregiverMessage';

// Abrir o WhatsApp na conversa do acompanhante, com a mensagem pronta.
//
// Decisão de 28/09: **no celular, o aplicativo instalado; no computador, o
// WhatsApp Web.** "Celular" vale para o app nativo e também para o site aberto
// no navegador de um celular — nos dois, quem recebe é o WhatsApp instalado.
//
// - Celular: `whatsapp://send`. A WebView do Capacitor entrega o endereço ao
//   sistema (`Bridge.launchIntent` no Android, `UIApplication.open` no iOS), e
//   o navegador do celular faz o mesmo. Nada passa por página web.
// - Computador: `https://web.whatsapp.com/send`, numa aba nova. A aba é
//   RESERVADA no toque (`prepareWhatsApp`), em branco, e recebe o endereço
//   quando a resposta do servidor chega: um `window.open` feito depois de uma
//   espera é bloqueado como pop-up. Como o texto vai na URL, a mensagem — com a
//   senha provisória — fica no histórico daquele navegador; é o custo aceito
//   por abrir o WhatsApp Web direto.
//
// NINGUÉM AVISA QUANDO O APLICATIVO NÃO ABRE. No Android o Capacitor engole a
// `ActivityNotFoundException` ("TODO - trigger an event", no código dele); no
// iOS e no navegador a falha também não volta para o JavaScript. Por isso, no
// celular, a abertura é CONFIRMADA pelo que o sistema faz com a tela: se outro
// aplicativo a assumiu, a página fica oculta ou perde o foco em instantes.

/** Quanto esperar o sistema trocar de aplicativo antes de concluir que o WhatsApp não abriu. */
const APP_SWITCH_TIMEOUT_MS = 2500;

/** Celular: o app nativo, ou o site num navegador de Android ou iPhone. */
function usesInstalledApp(): boolean {
  return Capacitor.isNativePlatform() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Resolve `true` quando outro aplicativo assume a tela (a página fica oculta ou
 * a janela perde o foco) e `false` se nada disso acontece a tempo.
 *
 * `blur` entra junto de `visibilitychange` porque há casos em que o app não vai
 * para segundo plano mas perde o foco: o seletor do Android quando há WhatsApp
 * e WhatsApp Business. Nesse caso o sistema atendeu — só falta a pessoa
 * escolher.
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

/** Abre o aplicativo instalado e confirma que ele assumiu a tela. */
function openInstalledApp(phoneE164: string, text: string): Promise<boolean> {
  // Os ouvintes entram ANTES da navegação: a troca de aplicativo pode acontecer
  // antes da próxima linha rodar.
  const switched = waitForAppSwitch(APP_SWITCH_TIMEOUT_MS);
  window.location.assign(buildWhatsAppAppUrl(phoneE164, text));
  return switched;
}

/** Um envio pelo WhatsApp preparado no toque. */
export interface WhatsAppLaunch {
  /**
   * Abre a conversa do número com o texto pronto. `true` quando o WhatsApp
   * abriu; `false` quando nada abriu (sem o app no celular, ou a aba recusada
   * no computador) — a senha desta mensagem não chegou a ninguém.
   *
   * A pessoa ainda toca em "enviar" dentro do WhatsApp: nenhum aplicativo manda
   * mensagem em nome de outra pessoa.
   */
  open: (phoneE164: string, text: string) => Promise<boolean>;
  /** Desiste (o servidor recusou): fecha a aba reservada, se houver. */
  cancel: () => void;
}

/**
 * Prepara o envio NO TOQUE, antes de qualquer espera: no computador, reserva a
 * aba em que o WhatsApp Web vai abrir. No celular não reserva nada.
 */
export function prepareWhatsApp(): WhatsAppLaunch {
  if (usesInstalledApp()) {
    return { open: openInstalledApp, cancel: () => {} };
  }

  const tab = window.open('about:blank', '_blank');
  // A página do WhatsApp não precisa — nem deve — alcançar o app pela
  // referência `opener`.
  if (tab) tab.opener = null;
  // Depois de a aba receber o WhatsApp Web, desistir não pode fechá-la: a
  // conversa já está lá, com a mensagem pronta.
  let launched = false;

  return {
    open: async (phoneE164, text) => {
      const url = buildWhatsAppWebUrl(phoneE164, text);

      if (tab && !tab.closed) {
        tab.location.href = url;
        launched = true;
        return true;
      }

      // O navegador recusou a reserva: tenta abrir agora. Sem o terceiro
      // argumento `'noopener'` — com ele, `window.open` devolve SEMPRE `null`,
      // e não daria para saber se abriu. O `opener` é cortado à mão.
      const opened = window.open(url, '_blank');
      if (!opened) return false;
      opened.opener = null;
      return true;
    },
    cancel: () => {
      if (!launched) tab?.close();
    },
  };
}
