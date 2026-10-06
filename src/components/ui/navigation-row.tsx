import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const rowVariants = cva(
  'flex items-center gap-3 border transition-[border-color,box-shadow,scale] duration-200 ease-[ease]',
  {
    variants: {
      surface: {
        /**
         * O card de lista do guia, nas telas do app (Perfil): branco, fio
         * claro, cantos de 14 px e a sombra única dos cards.
         */
        card: 'rounded-lg border-border bg-card shadow-sm hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))]',
        /**
         * Cartão que flutua sobre a capa verde (Central de Conhecimento): raio
         * de 20px e a mesma sombra dos cards; ao toque, encolhe de leve.
         */
        raised:
          'rounded-2xl border-border bg-card shadow-sm active:scale-[0.98] motion-reduce:active:scale-100',
      },
      density: {
        /** Linha de destaque, com espaço para um chip sob o título (acompanhante). */
        default: 'min-h-[72px] p-4',
        /** Lista de várias linhas seguidas (contatos). Continua acima dos 48 px de toque. */
        compact: 'min-h-[60px] px-4 py-3',
      },
      tone: {
        default: '',
        alert: '',
      },
    },
    compoundVariants: [
      // Atalho para sinais de alerta: o bloco `alert-soft` do guia
      // ("AlertaUrgencia"), com os cantos de 20 px das caixas de aviso.
      {
        surface: 'card',
        tone: 'alert',
        className:
          'rounded-2xl border-transparent bg-destructive-soft hover:border-[color-mix(in_srgb,var(--color-destructive)_45%,transparent)]',
      },
      {
        surface: 'raised',
        tone: 'alert',
        className: 'rounded-2xl border-transparent bg-destructive-soft',
      },
    ],
    defaultVariants: { surface: 'card', density: 'default', tone: 'default' },
  }
);

// No tom de alerta o título e a seta são vermelhos, como no folheto: a linha
// inteira diz "atenção", e não só o ícone. O título do alerta tem o tamanho do
// título da caixa de aviso do guia (`text-card-title`, 17/22, em negrito).
const titleVariants = cva('text-body font-semibold break-words', {
  variants: {
    tone: {
      default: 'text-foreground',
      alert: 'text-card-title font-bold text-destructive-deep',
    },
  },
  defaultVariants: { tone: 'default' },
});

const trailingVariants = cva('shrink-0', {
  variants: {
    tone: {
      default: 'text-muted-foreground',
      alert: 'text-destructive-deep',
    },
  },
  defaultVariants: { tone: 'default' },
});

// O ícone do começo vai solto, sem pastilha: traço de 2 px no verde escuro,
// como pede o guia ("sem ícones preenchidos coloridos decorativos").
const leadingIconVariants = cva('inline-flex shrink-0 items-center justify-center', {
  variants: {
    tone: {
      default: 'text-primary-deep',
      alert: 'text-destructive',
    },
  },
  defaultVariants: { tone: 'default' },
});

interface NavigationRowBaseProps extends VariantProps<typeof rowVariants> {
  title: string;
  /** Ícone do começo da linha, solto. Para outro começo (um avatar), use `leading`. */
  icon?: LucideIcon;
  /** O que vem antes do título quando não é o ícone padrão. Tem prioridade sobre `icon`. */
  leading?: ReactNode;
  /** Uma linha que diz o que há do outro lado. */
  description?: string;
  /** O que mais vai sob o título (ex.: um chip de situação). */
  children?: ReactNode;
  /** Ícone do fim da linha. Padrão: a seta de "abre outra tela". */
  trailingIcon?: LucideIcon;
  className?: string;
}

/**
 * Para onde a linha leva: uma tela do app (`to`) ou um endereço de fora
 * (`href`: telefone, site). `external` abre o endereço fora do app — no
 * celular, o Capacitor entrega ao navegador do sistema.
 */
type NavigationRowTarget =
  | { to: string; href?: never; external?: never }
  | { href: string; to?: never; external?: boolean };

export type NavigationRowProps = NavigationRowBaseProps & NavigationRowTarget;

/**
 * Linha que leva a outra tela ou a um contato: ícone (ou avatar), título, uma
 * linha de apoio e o ícone do fim. É o desenho das linhas de destaque do
 * Perfil (acompanhante, Central de Conhecimento, contatos da clínica).
 */
export default function NavigationRow({
  title,
  icon: Icon,
  leading,
  description,
  children,
  trailingIcon: TrailingIcon = ChevronRight,
  surface,
  density,
  tone,
  className,
  ...target
}: NavigationRowProps) {
  const classes = cn(rowVariants({ surface, density, tone }), className);
  const content = (
    <>
      {leading ??
        (Icon && (
          <span className={leadingIconVariants({ tone })}>
            <Icon size={24} strokeWidth={2} aria-hidden="true" />
          </span>
        ))}
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className={cn(titleVariants({ tone }))}>{title}</span>
        {description && <span className="text-body-sm break-words text-muted-foreground">{description}</span>}
        {children}
      </span>
      <TrailingIcon size={20} strokeWidth={2} className={cn(trailingVariants({ tone }))} aria-hidden="true" />
    </>
  );

  if (target.to !== undefined) {
    return (
      <Link to={target.to} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <a
      href={target.href}
      className={classes}
      {...(target.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {content}
    </a>
  );
}
