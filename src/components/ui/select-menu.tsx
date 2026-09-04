import * as React from 'react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectMenuOption {
  value: string;
  label: string;
}

export interface SelectMenuProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectMenuOption[];
  className?: string;
  'aria-label': string;
}

/** Altura máxima do painel — usada tanto no CSS quanto para decidir se ele abre pra cima. */
const PANEL_MAX_HEIGHT = 280;
/** Espaço entre o gatilho e o painel. */
const PANEL_GAP = 4;
/** Janela de silêncio do buffer de digitação (type-ahead) antes de reiniciar. */
const TYPEAHEAD_RESET_MS = 600;

interface PanelPosition {
  top: number;
  left: number;
  width: number;
  /** Painel virado pra cima porque não cabia embaixo do gatilho. */
  virado: boolean;
}

/**
 * Seletor de opção única, estilo pill: trigger com o rótulo escolhido + seta,
 * painel flutuante com a lista e um check na opção ativa.
 *
 * Hand-rolled, sem Radix — nenhum outro primitivo deste design system usa
 * (`Modal` é `createPortal` puro). Existe porque um `<select>` nativo aqui
 * abre o picker de tela cheia do sistema operacional em vez de um menu
 * compacto preso ao card, o que quebra a fidelidade ao protótipo.
 *
 * O painel é portalizado pro `document.body` (mesma técnica de `Modal`): sem
 * isso, o único uso real deste componente hoje fica dentro de um `<Card>`, e
 * `cardVariants` tem `overflow-hidden` incondicional na classe base — o
 * painel `position: absolute` ficaria cortado pela borda do card.
 */
const SelectMenu = React.forwardRef<
  HTMLButtonElement,
  SelectMenuProps &
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'value' | 'onClick'>
>(function SelectMenu({ value, onChange, options, className, ...rest }, forwardedRef) {
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState<PanelPosition | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const typeaheadBuffer = useRef('');
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const listboxId = useId();
  const selecionadoIndex = options.findIndex((option) => option.value === value);
  const selecionado = options[selecionadoIndex];

  // Encaminha a ref externa (se houver) sem abrir mão da própria — é como o
  // fechamento devolve o foco ao gatilho independente de quem mais o observa.
  function setButtonRef(node: HTMLButtonElement | null) {
    buttonRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }

  function fechar() {
    setAberto(false);
    // O elemento focado dentro do painel é removido do DOM ao fechar — sem
    // devolver o foco, o navegador o joga pro <body> (regra de focus-fixup
    // do HTML), e o próximo Tab do usuário recomeça do topo da página.
    buttonRef.current?.focus();
  }

  function abrir() {
    setAberto(true);
  }

  // Posição do painel: recalculada toda vez que abre, e enquanto abrir, a
  // cada resize/scroll — sem isso o painel "flutuante" desgruda do gatilho
  // se a página rolar com ele aberto.
  useLayoutEffect(() => {
    if (!aberto) {
      setPosicao(null);
      return;
    }

    function atualizarPosicao() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;

      const espacoAbaixo = window.innerHeight - rect.bottom;
      const virado = espacoAbaixo < PANEL_MAX_HEIGHT && rect.top > espacoAbaixo;

      setPosicao({
        left: rect.left,
        width: rect.width,
        virado,
        top: virado ? rect.top - PANEL_GAP : rect.bottom + PANEL_GAP,
      });
    }

    atualizarPosicao();
    window.addEventListener('resize', atualizarPosicao);
    window.addEventListener('scroll', atualizarPosicao, true);
    return () => {
      window.removeEventListener('resize', atualizarPosicao);
      window.removeEventListener('scroll', atualizarPosicao, true);
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;

    function handlePointerDown(event: PointerEvent) {
      const alvo = event.target as Node;
      if (containerRef.current?.contains(alvo)) return;
      // O painel é portalizado — não é descendente de `containerRef` no DOM,
      // então também precisa ser conferido explicitamente.
      if (panelRef.current?.contains(alvo)) return;
      setAberto(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') fechar();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [aberto]);

  const focarOpcao = useCallback(
    (index: number) => {
      const alvo = options[index];
      if (!alvo) return;
      optionRefs.current[index]?.focus();
    },
    [options]
  );

  // Índice a focar assim que o painel existir no DOM de verdade. Não é só
  // "depois do próximo render": `aberto` vira `true` primeiro, o painel
  // continua ausente (só nasce quando `posicao` também não é nula, que é
  // calculada no `useLayoutEffect` acima) — abrir e focar precisam de DOIS
  // ciclos de commit, não um `requestAnimationFrame` cronometrado no escuro
  // (que além disso é pausado em aba em segundo plano).
  const focoPendente = useRef<number | null>(null);

  useEffect(() => {
    if (aberto && posicao && focoPendente.current !== null) {
      focarOpcao(focoPendente.current);
      focoPendente.current = null;
    }
  }, [aberto, posicao, focarOpcao]);

  /** Abre o painel a partir do gatilho e move o foco pra opção certa. */
  function abrirComFoco(indexInicial: number) {
    focoPendente.current = indexInicial;
    abrir();
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (aberto) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const inicial = selecionadoIndex >= 0 ? selecionadoIndex : 0;
      abrirComFoco(inicial);
    }
  }

  /**
   * Navegação por teclado dentro do painel: seta cima/baixo (com wrap),
   * Home/End, e type-ahead (digitar uma letra pula pra opção que começa com
   * ela) — o que o `<select>` nativo substituído já dava de graça pelo
   * navegador, e que um dropdown hand-rolled precisa reimplementar.
   */
  function handleListKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    const atual = optionRefs.current.findIndex((el) => el === document.activeElement);
    const base = atual >= 0 ? atual : 0;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focarOpcao((base + 1) % options.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focarOpcao((base - 1 + options.length) % options.length);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      focarOpcao(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      focarOpcao(options.length - 1);
      return;
    }

    // Type-ahead: só caracteres imprimíveis de um dígito, sem modificador
    // (deixa Tab/Enter/Espaço/atalhos do navegador em paz).
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      window.clearTimeout(typeaheadTimer.current);
      typeaheadBuffer.current += event.key.toLowerCase();
      typeaheadTimer.current = setTimeout(() => {
        typeaheadBuffer.current = '';
      }, TYPEAHEAD_RESET_MS);

      const alvo = options.findIndex((option) =>
        option.label.toLowerCase().startsWith(typeaheadBuffer.current)
      );
      if (alvo >= 0) focarOpcao(alvo);
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={setButtonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={listboxId}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          'flex h-11 min-w-11 items-center justify-between gap-2 rounded-lg border bg-card px-3.5 text-[14px] font-medium text-foreground transition-[border-color,box-shadow] duration-150 ease-[ease] focus:outline-none',
          aberto
            ? 'border-ring shadow-[0_0_0_3px_var(--color-ring)]/25'
            : 'border-border hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))]'
        )}
        {...rest}
      >
        <span className="truncate">{selecionado?.label ?? ''}</span>
        <ChevronDown
          size={16}
          strokeWidth={2}
          className={cn(
            'shrink-0 text-muted-foreground transition-transform duration-150 ease-[ease]',
            aberto && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </button>

      {aberto &&
        posicao &&
        createPortal(
          <ul
            ref={panelRef}
            id={listboxId}
            role="listbox"
            onKeyDown={handleListKeyDown}
            className="fixed z-20 max-h-[280px] overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-[var(--shadow-lg)]"
            style={{
              top: posicao.virado ? undefined : posicao.top,
              bottom: posicao.virado ? window.innerHeight - posicao.top : undefined,
              left: posicao.left,
              minWidth: posicao.width,
              width: 'max-content',
              maxWidth: `calc(100vw - ${posicao.left * 2}px)`,
            }}
          >
            {options.map((option, index) => {
              const ativa = option.value === value;

              return (
                <li key={option.value}>
                  <button
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    type="button"
                    role="option"
                    aria-selected={ativa}
                    onClick={() => {
                      onChange(option.value);
                      fechar();
                    }}
                    className={cn(
                      'flex min-h-11 w-full items-center justify-between gap-4 px-3.5 py-2 text-left text-[14px] whitespace-nowrap text-foreground transition-colors duration-100 ease-[ease] hover:bg-muted focus:bg-muted focus:outline-none',
                      ativa && 'bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] font-medium'
                    )}
                  >
                    {option.label}
                    {ativa && (
                      <Check
                        size={16}
                        strokeWidth={2.5}
                        className="shrink-0 text-primary"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body
        )}
    </div>
  );
});

export default SelectMenu;
