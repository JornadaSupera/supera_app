import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { hasSystemBars, setSystemBarStyle, type SystemBar } from '../services/systemBars';
import { toneOfLayers, type SystemBarTone } from '../utils/systemBarTone';

/** Espera curta para juntar várias mudanças da tela numa conferência só. */
const SETTLE_MS = 80;

/** Fundo da página quando nada naquele ponto tem cor própria. */
function pageTone(): SystemBarTone {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/**
 * O tom do que está atrás de uma barra, olhando a tela naquele ponto.
 *
 * Quem passa por cima de tudo sem receber toque (a "porta de elevador" da
 * abertura) não aparece na conferência por toque e declara o próprio tom em
 * `data-system-bar-tone`; vale o último declarado na página.
 */
function toneAt(y: number): SystemBarTone {
  const declared = Array.from(document.querySelectorAll<HTMLElement>('[data-system-bar-tone]')).at(-1);
  const declaredTone = declared?.dataset.systemBarTone;
  if (declaredTone === 'dark' || declaredTone === 'light') return declaredTone;

  const layers = document
    .elementsFromPoint(window.innerWidth / 2, y)
    .map((element) => getComputedStyle(element).backgroundColor);

  return toneOfLayers(layers, pageTone());
}

/**
 * Mantém os ícones das barras do sistema legíveis sobre a tela: claros sobre a
 * capa verde, escuros sobre o fundo claro. Confere de novo a cada troca de
 * tela, quando algo abre por cima (folha, tela surpresa), ao rolar e ao trocar
 * o tema. No navegador não faz nada.
 */
export function useSystemBarsStyle() {
  const { pathname } = useLocation();
  const scheduleRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!hasSystemBars()) return undefined;

    const applied: Partial<Record<SystemBar, SystemBarTone>> = {};
    let timer: number | undefined;

    function apply(bar: SystemBar, tone: SystemBarTone) {
      if (applied[bar] === tone) return;
      applied[bar] = tone;
      void setSystemBarStyle(bar, tone);
    }

    function check() {
      timer = undefined;
      apply('status', toneAt(1));
      apply('navigation', toneAt(window.innerHeight - 2));
    }

    function schedule() {
      if (timer !== undefined) return;
      timer = window.setTimeout(check, SETTLE_MS);
    }
    scheduleRef.current = schedule;

    const bodyObserver = new MutationObserver(schedule);
    bodyObserver.observe(document.body, { childList: true, subtree: true });
    const themeObserver = new MutationObserver(schedule);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    document.addEventListener('visibilitychange', schedule);
    schedule();

    return () => {
      window.clearTimeout(timer);
      bodyObserver.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      document.removeEventListener('visibilitychange', schedule);
      scheduleRef.current = () => undefined;
    };
  }, []);

  useEffect(() => {
    scheduleRef.current();
  }, [pathname]);
}
