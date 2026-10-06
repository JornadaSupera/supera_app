import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router';

/**
 * Por quanto tempo, no máximo, a volta espera a tela antiga crescer até a
 * altura em que a pessoa estava (a lista ainda pintando os cartões).
 */
const RESTORE_TIMEOUT_MS = 1500;

/** Qualquer gesto da pessoa encerra a espera: quem rola é ela. */
const USER_SCROLL_EVENTS = ['touchstart', 'wheel', 'keydown'] as const;

/**
 * Onde a pessoa estava em cada passo do histórico, para o "voltar" devolvê-la
 * ao mesmo ponto. Só em memória: não guarda nada do paciente, só números, e
 * some quando o app fecha.
 */
const savedPositions = new Map<string, number>();

/**
 * Leva a página até `top` e, se a tela ainda não tem essa altura, tenta de
 * novo a cada vez que ela cresce. Devolve quem cancela a espera.
 */
function restoreScroll(top: number): () => void {
  const reachable = () => document.documentElement.scrollHeight - window.innerHeight >= top;

  window.scrollTo(0, top);
  if (reachable()) return () => {};

  const observer = new ResizeObserver(() => {
    window.scrollTo(0, top);
    if (reachable()) stop();
  });
  const timer = window.setTimeout(stop, RESTORE_TIMEOUT_MS);

  function stop() {
    observer.disconnect();
    window.clearTimeout(timer);
    for (const type of USER_SCROLL_EVENTS) window.removeEventListener(type, stop);
  }

  observer.observe(document.body);
  for (const type of USER_SCROLL_EVENTS) window.addEventListener(type, stop, { passive: true });
  return stop;
}

/**
 * A rolagem ao trocar de tela.
 *
 * O roteador do app não cuida disso, e a janela é uma só para todas as
 * telas: sem este cuidado, a tela nova abria na altura em que a anterior
 * estava — tocar em "Meu acompanhante" no fim do Perfil, ou num tema no fim
 * da Central de Conhecimento, abria a tela seguinte já no fim dela.
 *
 * - Ir para outra tela começa no topo.
 * - Voltar (ou avançar pelo histórico) devolve a altura em que se estava.
 * - Mudar só o filtro ou a aba no endereço (mesma tela) não mexe na rolagem.
 */
export function useRouteScrollRestoration() {
  const { key, pathname } = useLocation();
  const navigationType = useNavigationType();
  const currentKey = useRef(key);
  const previousPathname = useRef(pathname);

  // Sem isto, o navegador devolve a rolagem por conta própria ao voltar, mas
  // antes de a tela antiga estar desenhada — e para no meio do caminho.
  useEffect(() => {
    const { history } = window;
    const previous = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    return () => {
      history.scrollRestoration = previous;
    };
  }, []);

  // Anota a altura do passo atual a cada rolagem.
  useEffect(() => {
    const save = () => savedPositions.set(currentKey.current, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, []);

  // Antes da pintura: a tela nova já aparece no lugar certo, sem pular.
  useLayoutEffect(() => {
    currentKey.current = key;
    const pathnameChanged = previousPathname.current !== pathname;
    previousPathname.current = pathname;

    if (navigationType !== 'POP') {
      if (pathnameChanged) window.scrollTo(0, 0);
      return;
    }

    const saved = savedPositions.get(key);
    if (saved === undefined) return;
    return restoreScroll(saved);
  }, [key, pathname, navigationType]);
}
