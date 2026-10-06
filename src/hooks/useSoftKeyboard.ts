import { useEffect, useState } from 'react';

/**
 * Quanto a área visível precisa encolher (px) para contar como teclado aberto.
 * Abaixo disso é a barra do navegador recolhendo ou a de sugestões do teclado.
 */
const KEYBOARD_MIN_HEIGHT = 120;

/** Espera o teclado terminar de subir antes de centralizar o campo (ms). */
const SETTLE_DELAY = 250;

/** Campo que abre o teclado: texto, número, e-mail… Não o de data (`inputMode="none"`). */
function isTypingField(element: Element | null): element is HTMLElement {
  if (element instanceof HTMLTextAreaElement) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  if (element.inputMode === 'none' || element.readOnly) return false;
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color'].includes(element.type);
}

/**
 * Diz se o teclado do celular está aberto sobre a tela e, enquanto estiver,
 * leva o campo em foco para o meio da área visível — inclusive ao pular de um
 * campo para outro.
 *
 * Mede pela `visualViewport`, que encolhe com o teclado no iOS (que sobrepõe a
 * página) e no Android (que encolhe a janela). A referência é a maior altura
 * já vista, refeita ao girar o aparelho. Sem `visualViewport` (navegador
 * antigo), fica sempre fechado: a tela só não reage.
 */
export function useSoftKeyboard(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let fullHeight = viewport.height;
    let focusTimer: number | undefined;
    let scrollTimer: number | undefined;
    let wasOpen = false;
    let lastFocused: Element | null = null;

    const centerFocusedField = () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        const active = document.activeElement;
        if (!isTypingField(active)) return;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        active.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      }, SETTLE_DELAY);
    };

    const update = () => {
      fullHeight = Math.max(fullHeight, viewport.height);
      const active = document.activeElement;
      const next = isTypingField(active) && fullHeight - viewport.height > KEYBOARD_MIN_HEIGHT;

      if (next && (!wasOpen || active !== lastFocused)) centerFocusedField();
      wasOpen = next;
      lastFocused = active;
      setOpen(next);
    };

    // Ao trocar de campo, o `focusout` de um vem antes do `focusin` do outro:
    // decidir na hora fecharia e reabriria a tela num piscar. Um instante de
    // espera e o foco já está no campo novo.
    const updateAfterFocus = () => {
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(update, 60);
    };

    const resetReference = () => {
      fullHeight = viewport.height;
      update();
    };

    viewport.addEventListener('resize', update);
    document.addEventListener('focusin', updateAfterFocus);
    document.addEventListener('focusout', updateAfterFocus);
    window.addEventListener('orientationchange', resetReference);

    return () => {
      window.clearTimeout(focusTimer);
      window.clearTimeout(scrollTimer);
      viewport.removeEventListener('resize', update);
      document.removeEventListener('focusin', updateAfterFocus);
      document.removeEventListener('focusout', updateAfterFocus);
      window.removeEventListener('orientationchange', resetReference);
    };
  }, []);

  return open;
}
