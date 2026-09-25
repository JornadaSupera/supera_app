import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const HEADING_TAGS = { 2: 'h2', 3: 'h3', 4: 'h4' } as const;

export interface ExpansionTileProps {
  title: string;
  /** Uma linha que diz o que há dentro, para quem decide se vale abrir. */
  subtitle?: string;
  icon?: LucideIcon;
  /** Aberto ao montar. Padrão: recolhido, para o conteúdo não tomar a tela sem ser pedido. */
  defaultOpen?: boolean;
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
  headingLevel = 2,
  children,
  className,
}: ExpansionTileProps) {
  const [open, setOpen] = useState(defaultOpen);
  const Heading = HEADING_TAGS[headingLevel];
  const id = useId();
  const buttonId = `${id}-header`;
  const panelId = `${id}-panel`;

  return (
    <div className={className}>
      {/* O botão herda a fonte do título (`font: inherit`): o título volta ao
          tamanho e peso do corpo, e cada linha do cabeçalho define os seus. */}
      <Heading className="text-[14px] font-normal">
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
        >
          {Icon && <Icon size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14px] font-semibold text-foreground">{title}</span>
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
          <div className="pt-2">{children}</div>
        </div>
      </div>
    </div>
  );
}
