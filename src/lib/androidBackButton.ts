// O botão voltar do Android.
//
// Sem o plugin `@capacitor/app`, o Capacitor não trata o voltar: a cada toque,
// o `MainActivity` pergunta ao app, por `window.superaHandleBack()`, se ele
// cuidou do voltar e, se não, minimiza o app. A ordem é:
//
// 1. Algo aberto por cima da tela se fecha (a foto em tela cheia do chat, uma
//    folha). Quem quer ser fechado pelo voltar se empilha aqui enquanto está
//    aberto, e o voltar fecha o do topo. As telas que não podem ser deixadas
//    (versão nova obrigatória, tela do sino) empilham um fechamento que não
//    faz nada.
// 2. Sem nada aberto, o app volta para a tela anterior, como a seta do
//    cabeçalho (pedido de 05/10).
// 3. Nas telas de cada aba, e na primeira tela da sessão, não há para onde
//    voltar dentro do app: o voltar minimiza, como antes.

type BackHandler = () => void;

const handlers: BackHandler[] = [];

/**
 * As telas das abas da barra de baixo. Delas o voltar não leva a outra aba
 * nem ao login (que o histórico ainda guarda): minimiza o app.
 */
const TAB_ROOTS = new Set(['/home', '/agenda', '/diario', '/chat', '/perfil']);

declare global {
  interface Window {
    /** Chamado pelo `MainActivity` a cada voltar do Android: `true` quando o app cuidou dele. */
    superaHandleBack?: () => boolean;
  }
}

/**
 * Há tela anterior do próprio app? O React Router guarda em `history.state.idx`
 * a posição no histórico desta sessão (0 é a primeira tela aberta).
 */
function canGoBackInApp(): boolean {
  if (TAB_ROOTS.has(window.location.pathname)) return false;
  const state: unknown = window.history.state;
  if (typeof state !== 'object' || state === null || !('idx' in state)) return false;
  return typeof state.idx === 'number' && state.idx > 0;
}

window.superaHandleBack = () => {
  const handler = handlers.at(-1);
  if (handler) {
    handler();
    return true;
  }

  if (canGoBackInApp()) {
    window.history.back();
    return true;
  }

  return false;
};

/**
 * Empilha um fechamento para o voltar do Android. Devolve a função que o tira
 * da pilha — chamar ao fechar por outro caminho (botão, gesto, Esc).
 */
export function pushBackHandler(handler: BackHandler): () => void {
  handlers.push(handler);

  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}
