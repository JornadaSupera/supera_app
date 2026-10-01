// O botão voltar do Android.
//
// Sem o plugin `@capacitor/app`, o Capacitor não trata o voltar: a cada toque,
// o `MainActivity` pergunta ao app, por `window.superaHandleBack()`, se há algo
// aberto para fechar e, se não houver, minimiza o app — o que o Android já
// fazia em qualquer tela. Quem quer ser fechado pelo voltar (hoje, só a foto
// em tela cheia do chat) se empilha aqui enquanto está aberto, e o voltar
// fecha o do topo.

type BackHandler = () => void;

const handlers: BackHandler[] = [];

declare global {
  interface Window {
    /** Chamado pelo `MainActivity` a cada voltar do Android: `true` quando algo foi fechado. */
    superaHandleBack?: () => boolean;
  }
}

window.superaHandleBack = () => {
  const handler = handlers.at(-1);
  if (!handler) return false;
  handler();
  return true;
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
