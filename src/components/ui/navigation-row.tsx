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
        /** Cartão branco das telas do app (Perfil). */
        card: 'rounded-xl border-border bg-card hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm',
        /**
         * Cartão que flutua sobre a capa verde (Central de Conhecimento): raio
         * de 20px e sombra larga; ao toque, encolhe de leve e a sombra cresce.
         */
        raised:
          'rounded-[20px] border-border bg-card shadow-[var(--shadow-raised)] hover:shadow-[var(--shadow-raised-strong)] active:scale-[0.98] active:shadow-[var(--shadow-raised-strong)] motion-reduce:active:scale-100',
      },
      density: {
        /** Linha de destaque, com espaço para um chip sob o título (acompanhante). */
        default: 'min-h-[72px] p-4',
        /** Lista de várias linhas seguidas (contatos). Continua acima dos 44 px de toque. */
        compact: 'min-h-[60px] px-4 py-3',
      },
      tone: {
        default: '',
        alert: '',
      },
    },
    compoundVariants: [
      // Atalho para sinais de alerta: o vermelho do perigo, discreto.
      {
        surface: 'card',
        tone: 'alert',
        className:
          'border-[color-mix(in_srgb,var(--color-destructive)_28%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-destructive)_5%,var(--color-card))] hover:border-[color-mix(in_srgb,var(--color-destructive)_45%,var(--color-border))]',
      },
      {
        surface: 'raised',
        tone: 'alert',
        className:
          'border-[color-mix(in_srgb,var(--color-destructive)_22%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-destructive)_4%,var(--color-card))]',
      },
    ],
    defaultVariants: { surface: 'card', density: 'default', tone: 'default' },
  }
);

// No tom de alerta o título e a seta são vermelhos, como no folheto: a linha
// inteira diz "atenção", e não só o ícone.
const titleVariants = cva('text-[14px] font-semibold break-words', {
  variants: {
    tone: {
      default: 'text-foreground',
      alert: 'text-[var(--color-destructive-deep)]',
    },
  },
  defaultVariants: { tone: 'default' },
});

const trailingVariants = cva('shrink-0', {
  variants: {
    tone: {
      default: 'text-muted-foreground',
      alert: 'text-[var(--color-destructive-deep)]',
    },
  },
  defaultVariants: { tone: 'default' },
});

const badgeVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground',
  {
    variants: {
      density: {
        default: 'size-10',
        compact: 'size-9',
      },
      tone: {
        default: '',
        alert: 'bg-[color-mix(in_srgb,var(--color-destructive)_12%,transparent)] text-destructive',
      },
    },
    defaultVariants: { density: 'default', tone: 'default' },
  }
);

interface NavigationRowBaseProps extends VariantProps<typeof rowVariants> {
  title: string;
  /** Ícone no selo redondo padrão. Para outro começo (um avatar), use `leading`. */
  icon?: LucideIcon;
  /** O que vem antes do título quando não é o selo padrão. Tem prioridade sobre `icon`. */
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
 * Linha que leva a outra tela ou a um contato: selo (ou avatar), título, uma
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
          <span className={cn(badgeVariants({ density, tone }))}>
            <Icon size={18} strokeWidth={2} aria-hidden="true" />
          </span>
        ))}
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className={cn(titleVariants({ tone }))}>{title}</span>
        {description && <span className="text-[12px]/[1.4] text-muted-foreground">{description}</span>}
        {children}
      </span>
      <TrailingIcon size={16} strokeWidth={2} className={cn(trailingVariants({ tone }))} aria-hidden="true" />
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
