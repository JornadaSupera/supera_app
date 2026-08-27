import { Link } from 'react-router';
import { Activity, Calendar, BookOpen, MessageCircle, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Shortcut {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Cor do ícone é fixa por atalho (não depende de dado da API), então vira
   * classe estática em vez de `style` — diferente do empilhamento de avatar
   * em CareTeamTeaser, que é per-instance de verdade. */
  iconClassName: string;
}

const SHORTCUTS: Shortcut[] = [
  {
    label: 'Diário',
    to: '/diario',
    icon: Activity,
    iconClassName:
      'bg-[color-mix(in_srgb,var(--color-supera-empatia)_15%,transparent)] text-[var(--color-supera-empatia)]',
  },
  {
    label: 'Agenda',
    to: '/agenda',
    icon: Calendar,
    iconClassName: 'bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-primary',
  },
  {
    label: 'Orientações',
    to: '/orientacoes',
    icon: BookOpen,
    iconClassName: 'bg-secondary text-secondary-foreground',
  },
  {
    label: 'Chat',
    to: '/chat',
    icon: MessageCircle,
    iconClassName:
      'bg-[color-mix(in_srgb,var(--color-supera-uniao)_15%,transparent)] text-[var(--color-supera-uniao)]',
  },
];

interface ShortcutsGridProps {
  mensagensNaoLidas?: number;
}

export default function ShortcutsGrid({ mensagensNaoLidas = 0 }: ShortcutsGridProps) {
  return (
    <section>
      <h3 className="mb-3 text-[12px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
        Atalhos
      </h3>

      <div className="grid grid-cols-4 gap-3">
        {SHORTCUTS.map((item) => {
          const Icon = item.icon;
          const showIndicator = item.label === 'Chat' && mensagensNaoLidas > 0;

          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm"
            >
              <span
                className={cn(
                  'relative inline-flex items-center justify-center rounded-lg p-2',
                  item.iconClassName
                )}
              >
                <Icon size={16} strokeWidth={2} />
                {showIndicator && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive"
                  />
                )}
              </span>
              <span className="text-center text-[11px] font-medium text-foreground">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
