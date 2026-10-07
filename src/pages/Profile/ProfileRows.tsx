import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import SectionHeading from '../../components/ui/section-heading';
import { cn } from '../../lib/utils';

// As peças que o Perfil repetia: o título de seção, a linha de informação
// (ícone, rótulo e valor) e a linha que leva a outra tela.

/**
 * O card de lista do guia nas linhas do Perfil: branco, fio claro, cantos de
 * 14 px, 16 px de respiro, 48 px de altura, no mínimo, e a sombra única dos
 * cards — a mesma na linha que se toca e na que só informa: o guia tem uma
 * elevação só.
 */
export const profileRowClass =
  'flex min-h-12 items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm';

/**
 * A linha que se toca (leva a outra tela ou abre um documento): ao passar o
 * ponteiro, só o fio ganha um toque de verde, como na `NavigationRow` ao lado.
 */
export const profileLinkRowClass = `${profileRowClass} transition-[border-color] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))]`;

interface ProfileSectionProps {
  title: string;
  /** A seção ainda está carregando (vai ao `aria-busy`). */
  busy?: boolean;
  children: ReactNode;
}

/**
 * Seção do Perfil: o título na faixa do guia, em frase normal, e o conteúdo
 * logo abaixo. O espaço é `gap`: o reset de `index.css` zera a margem do `<h2>`.
 */
export function ProfileSection({ title, busy, children }: ProfileSectionProps) {
  return (
    <section aria-busy={busy || undefined} className="flex flex-col gap-3">
      <SectionHeading>{title}</SectionHeading>
      {children}
    </section>
  );
}

interface ProfileInfoRowProps {
  icon: LucideIcon;
  label: string;
  /** Troca a cor do ícone (ex.: alergias no laranja de atenção). */
  iconClassName?: string;
  children: ReactNode;
}

/**
 * Cartão de um dado da ficha: ícone à esquerda, rótulo pequeno e o valor. Leva
 * a sombra única dos cards, como as linhas que se tocam.
 */
export function ProfileInfoRow({ icon: Icon, label, iconClassName, children }: ProfileInfoRowProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <Icon size={24} strokeWidth={2} className={cn('shrink-0 text-primary-deep', iconClassName)} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-caption font-medium text-muted-foreground">{label}</p>
        {children}
      </div>
    </div>
  );
}

/** O valor de um `ProfileInfoRow` quando é só texto. */
export function ProfileInfoValue({ children }: { children: ReactNode }) {
  return <p className="text-body text-foreground">{children}</p>;
}

interface ProfileLinkRowProps {
  to: string;
  icon: LucideIcon;
  label: string;
}

/**
 * Linha que leva a outra tela, com a seta à direita. Todas na mesma paleta,
 * inclusive a da exclusão da conta (pedido de 07/10).
 */
export function ProfileLinkRow({ to, icon: Icon, label }: ProfileLinkRowProps) {
  return (
    <Link to={to} className={profileLinkRowClass}>
      <Icon size={24} strokeWidth={2} className="shrink-0 text-primary-deep" aria-hidden="true" />
      <span className="flex-1 text-body font-normal text-foreground">{label}</span>
      {/* A seta tem o tamanho da da `NavigationRow`, que divide a tela com esta linha. */}
      <ChevronRight size={20} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
