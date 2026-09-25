import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const HEADING_TAGS = { 2: 'h2', 3: 'h3', 4: 'h4' } as const;

/** Duração da abertura e do fechamento (a mesma do `duration-200` abaixo). */
const TOGGLE_DURATION_MS = 200;

// `default`: o cabeçalho é um cartão e o conteúdo aparece embaixo dele, solto
// (bloco de ajustes, como as Preferências do Perfil).
// `contained`: cabeçalho e conteúdo dentro do mesmo cartão, separados por uma
// linha quando aberto (lista de perguntas e respostas).
const tileVariants = cva('', {
  variants: {
    variant: {
      default: '',
      // Sem `overflow-hidden`: cortaria o contorno de foco do cabeçalho, que o
      // reset global desenha 2px para fora do botão.
      contained: 'rounded-xl border bg-card transition-[border-color,box-shadow] duration-200 ease-[ease]',
    },
    open: { true: '', false: '' },
  },
  compoundVariants: [
    { variant: 'contained', open: false, className: 'border-border' },
    {
      variant: 'contained',
      open: true,
      className: 'border-[color-mix(in_srgb,var(--color-primary)_35%,var(--color-border))] shadow-sm',
    },
  ],
  defaultVariants: { variant: 'default', open: false },
});

const headerVariants = cva(
  'flex min-h-[56px] w-full cursor-pointer items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]',
  {
    variants: {
      variant: {
        default:
          'rounded-xl border border-border bg-card p-3.5 transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm',
        // Arredondado como o cartão, para o fundo do toque não sair pelos cantos.
        contained:
          'rounded-xl bg-transparent px-4 py-3.5 transition-colors duration-200 ease-[ease] hover:bg-[color-mix(in_srgb,var(--color-muted)_45%,transparent)] active:bg-[color-mix(in_srgb,var(--color-muted)_70%,transparent)]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

const titleVariants = cva('font-semibold text-foreground', {
  variants: {
    variant: {
      default: 'text-[14px]',
      contained: 'text-[15px]/[1.4]',
    },
  },
  defaultVariants: { variant: 'default' },
});

const contentVariants = cva('', {
  variants: {
    variant: {
      default: 'pt-2',
      contained: 'border-t border-border px-4 pt-3.5 pb-4',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface ExpansionTileProps extends Pick<VariantProps<typeof tileVariants>, 'variant'> {
  title: string;
  /** Uma linha que diz o que há dentro, para quem decide se vale abrir. */
  subtitle?: string;
  icon?: LucideIcon;
  /** Aberto ao montar. Padrão: recolhido, para o conteúdo não tomar a tela sem ser pedido. */
  defaultOpen?: boolean;
  /**
   * Aberto ou fechado, decidido por quem usa (com `onOpenChange`). Serve a uma
   * lista em que só um fica aberto por vez. Sem esta prop, o bloco guarda o
   * próprio estado.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Ao abrir, traz o cabeçalho de volta à tela se ele ficou acima dela.
   *
   * Numa lista em que só um fica aberto, abrir um item fecha o de cima, e o
   * texto que some empurra o item recém-aberto para cima, às vezes para fora da
   * tela: a pessoa toca e não vê o que abriu. A distância do topo (para não
   * ficar sob o cabeçalho fixo) vem de `scroll-margin-top`, no `className`.
   */
  revealOnOpen?: boolean;
  /**
   * Nível do título que envolve o cabeçalho (padrão accordion do WAI-ARIA): quem
   * navega por títulos no leitor de tela acha o bloco mesmo recolhido. Use o
   * nível das seções vizinhas.
   */
  headingLevel?: 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}

/**
 * Bloco que recolhe e expande: o cabeçalho fica sempre à vista e o conteúdo só
 * ocupa espaço quando a pessoa o abre.
 *
 * O conteúdo continua montado enquanto recolhido (só fica sem altura e
 * `inert`, fora do foco e da leitura de tela). Desmontar apagaria o que ainda
 * está em andamento lá dentro — um campo com gravação adiada, uma consulta em
 * curso — e faria o bloco recarregar a cada abertura.
 *
 * A altura anima pela linha do grid (0fr → 1fr), sem medir nada em JS; com
 * movimento reduzido a troca é instantânea.
 */
export default function ExpansionTile({
  title,
  subtitle,
  icon: Icon,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  revealOnOpen = false,
  headingLevel = 2,
  variant,
  children,
  className,
}: ExpansionTileProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;

  const rootRef = useRef<HTMLDivElement>(null);
  const Heading = HEADING_TAGS[headingLevel];
  const id = useId();
  const buttonId = `${id}-header`;
  const panelId = `${id}-panel`;

  function handleToggle() {
    const next = !open;
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  // Espera a animação terminar (a do bloco que fecha e a deste, que abre, têm
  // a mesma duração) e só rola se o cabeçalho tiver saído por cima. Onde o
  // navegador já segura a posição sozinho (ancoragem de rolagem), não há o que
  // corrigir e nada se mexe.
  useEffect(() => {
    if (!open || !revealOnOpen) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(
      () => {
        const root = rootRef.current;
        if (!root) return;

        const topOffset = Number.parseFloat(getComputedStyle(root).scrollMarginTop) || 0;
        if (root.getBoundingClientRect().top < topOffset) {
          root.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
        }
      },
      reduceMotion ? 0 : TOGGLE_DURATION_MS
    );

    return () => window.clearTimeout(timer);
  }, [open, revealOnOpen]);

  return (
    <div ref={rootRef} className={cn(tileVariants({ variant, open }), className)}>
      {/* O botão herda a fonte do título (`font: inherit`): o título volta ao
          tamanho e peso do corpo, e cada linha do cabeçalho define os seus. */}
      <Heading className="text-[14px] font-normal">
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={handleToggle}
          className={headerVariants({ variant })}
        >
          {Icon && <Icon size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={titleVariants({ variant })}>{title}</span>
            {subtitle && <span className="text-[12px]/[1.4] font-normal text-muted-foreground">{subtitle}</span>}
          </span>
          <ChevronDown
            size={18}
            strokeWidth={2}
            className={cn(
              'shrink-0 text-muted-foreground transition-transform duration-200 ease-[ease] motion-reduce:transition-none',
              open && 'rotate-180'
            )}
            aria-hidden="true"
          />
        </button>
      </Heading>

      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-[ease] motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={contentVariants({ variant })}>{children}</div>
        </div>
      </div>
    </div>
  );
}
