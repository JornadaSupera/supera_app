import { Link } from 'react-router';
import { BookOpen, Calendar, Library, MessageCircle, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Bolha do ícone do atalho.
 *
 * Uma classe única, sem cor por atalho: os quatro atalhos são o mesmo tipo de
 * elemento, e quatro cores de marca diferentes lado a lado sugeriam uma
 * hierarquia que não existe. O verde vem do token da marca (`--color-primary`)
 * na mesma fórmula de 15% que todas as outras bolhas de ícone do app usam —
 * então funciona igual no tema claro e no escuro.
 */
const SHORTCUT_ICON_CLASS =
  'relative inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-primary';

interface Shortcut {
  label: string;
  to: string;
  icon: LucideIcon;
}

/**
 * Os ícones espelham os da barra inferior para o mesmo destino — antes o
 * atalho "Diário" levava `Activity` enquanto a aba "Diário", logo abaixo na
 * mesma tela, levava `BookOpen`. Orientações fica com `Library`, que é o
 * próprio título da tela ("Biblioteca") e não colide com nenhuma aba.
 */
const SHORTCUTS: Shortcut[] = [
  { label: 'Diário', to: '/diario', icon: BookOpen },
  { label: 'Agenda', to: '/agenda', icon: Calendar },
  { label: 'Orientações', to: '/orientacoes', icon: Library },
  { label: 'Chat', to: '/chat', icon: MessageCircle },
];

interface ShortcutsGridProps {
  mensagensNaoLidas?: number;
}

export default function ShortcutsGrid({ mensagensNaoLidas = 0 }: ShortcutsGridProps) {
  return (
    <section>
      <h3 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
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
              <span className={cn(SHORTCUT_ICON_CLASS)}>
                <Icon size={16} strokeWidth={2} aria-hidden="true" />
                {showIndicator && (
                  // Mesma cor do contador de não lidas do Chat e do Centro de
                  // Notificações — o mesmo dado não pode aparecer verde em uma
                  // tela e vermelho na outra.
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--color-supera-empatia)]"
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
