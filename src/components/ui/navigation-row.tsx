import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NavigationRowProps {
  to: string;
  title: string;
  /** Ícone no selo redondo padrão. Para outro começo (um avatar), use `leading`. */
  icon?: LucideIcon;
  /** O que vem antes do título quando não é o selo padrão. Tem prioridade sobre `icon`. */
  leading?: ReactNode;
  /** Uma linha que diz o que há do outro lado. */
  description?: string;
  /** O que mais vai sob o título (ex.: um chip de situação). */
  children?: ReactNode;
  className?: string;
}

/** Selo redondo com o ícone da linha. */
function IconBadge({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
      <Icon size={18} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

/**
 * Linha que leva a outra tela: selo (ou avatar), título, uma linha de apoio e
 * a seta. É o desenho das linhas de destaque do Perfil (acompanhante, Central
 * de Conhecimento).
 */
export default function NavigationRow({
  to,
  title,
  icon,
  leading,
  description,
  children,
  className,
}: NavigationRowProps) {
  return (
    <Link
      to={to}
      className={cn(
        'flex min-h-[72px] items-center gap-3 rounded-xl border border-border bg-card p-4',
        'transition-[border-color,box-shadow] duration-200 ease-[ease]',
        'hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm',
        className
      )}
    >
      {leading ?? (icon && <IconBadge icon={icon} />)}
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="text-[14px] font-semibold break-words text-foreground">{title}</span>
        {description && <span className="text-[12px]/[1.4] text-muted-foreground">{description}</span>}
        {children}
      </span>
      <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
