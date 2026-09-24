// Versão nova no ar com o app aberto.
//
// As telas são carregadas sob demanda, cada uma no seu arquivo. Quando sai um
// deploy, os arquivos da versão anterior deixam de existir no servidor, e o
// pedido da próxima tela falha. Não é bug de programação: recarregar traz a
// versão nova e resolve. Estas duas funções reconhecem esse caso e recarregam
// uma única vez.

const RELOAD_MARK_KEY = 'supera_recarga_versao';

/** Dentro desta janela, um segundo recarregamento seria laço, não tentativa. */
const RELOAD_WINDOW_MS = 30_000;

/**
 * O erro é de um arquivo de tela que não pôde ser carregado? As mensagens
 * mudam conforme o navegador, por isso a lista.
 */
export function isStaleChunkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  return /dynamically imported module|module script failed|preload CSS/i.test(error.message);
}

/**
 * Recarrega uma vez e devolve `true` quando recarregou.
 *
 * A marca com horário evita o laço: se o recarregamento não resolver, a falha
 * seguinte vai para a tela de erro em vez de recarregar de novo. Sem
 * `sessionStorage` disponível (janela privada, WebView restrita), não
 * recarrega sozinho — ficar preso num laço é pior que pedir um toque.
 */
export function reloadOnceAfterStaleChunk(): boolean {
  try {
    const ultimaRecarga = Number(sessionStorage.getItem(RELOAD_MARK_KEY) ?? '0');
    if (Number.isFinite(ultimaRecarga) && Date.now() - ultimaRecarga < RELOAD_WINDOW_MS) {
      return false;
    }
    sessionStorage.setItem(RELOAD_MARK_KEY, String(Date.now()));
  } catch {
    return false;
  }

  window.location.reload();
  return true;
}
