import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cva } from 'class-variance-authority';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

// As peças que o Perfil repetia: o título de seção, a linha de informação
// (ícone, rótulo e valor) e a linha que leva a outra tela.

interface ProfileSectionProps {
  title: string;
  children: ReactNode;
}

/** Seção do Perfil: título em caixa-alta e o conteúdo logo abaixo. */
export function ProfileSection({ title, children }: ProfileSectionProps) {
  return (
    <section>
      <h2 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

interface ProfileInfoRowProps {
  icon: LucideIcon;
  label: string;
  /** Troca a cor do ícone (ex.: alergias em vermelho). */
  iconClassName?: string;
  children: ReactNode;
}

/** Cartão de um dado da ficha: ícone à esquerda, rótulo pequeno e o valor. */
export function ProfileInfoRow({ icon: Icon, label, iconClassName, children }: ProfileInfoRowProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
      <Icon
        size={16}
        strokeWidth={2}
        className={cn('mt-[2px] shrink-0 text-muted-foreground', iconClassName)}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
          {label}
        </p>
        {children}
      </div>
    </div>
  );
}

/** O valor de um `ProfileInfoRow` quando é só texto. */
export function ProfileInfoValue({ children }: { children: ReactNode }) {
  return <p className="mt-[2px] text-[14px] leading-[1.4] text-foreground">{children}</p>;
}

const linkRowIcon = cva('shrink-0', {
  variants: {
    tone: {
      default: 'text-muted-foreground',
      danger: 'text-destructive',
    },
  },
  defaultVariants: { tone: 'default' },
});

const linkRowLabel = cva('flex-1 text-[14px] font-normal', {
  variants: {
    tone: {
      default: 'text-foreground',
      danger: 'text-destructive',
    },
  },
  defaultVariants: { tone: 'default' },
});

interface ProfileLinkRowProps {
  to: string;
  icon: LucideIcon;
  label: string;
  /** `danger`: ação que encerra algo (ex.: pedir a exclusão da conta). */
  tone?: 'default' | 'danger';
}

/** Linha que leva a outra tela, com a seta à direita. */
export function ProfileLinkRow({ to, icon: Icon, label, tone = 'default' }: ProfileLinkRowProps) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm"
    >
      <Icon size={16} strokeWidth={2} className={linkRowIcon({ tone })} aria-hidden="true" />
      <span className={linkRowLabel({ tone })}>{label}</span>
      <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
