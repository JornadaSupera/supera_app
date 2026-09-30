import { NavLink } from 'react-router';
import { Activity, Calendar, BookOpen, MessageCircle, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUnreadConversationsCount } from '@/hooks/useChat';
import { useScopeFilter } from '@/hooks/useCaregiver';
import { SCOPE_BY_TAB_PATH } from '@/utils/caregiverScopes';

interface TabItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** `/home` casa com prefixos de outras rotas, então exige match exato. */
  end?: boolean;
}

/**
 * Colunas da barra conforme o número de abas. Classes inteiras, e não montadas
 * por texto: o Tailwind só gera o que encontra escrito.
 */
const GRID_COLS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
};

const ITEMS: TabItem[] = [
  { to: '/home', label: 'Início', icon: Activity, end: true },
  { to: '/agenda', label: 'Agenda', icon: Calendar },
  { to: '/diario', label: 'Diário', icon: BookOpen },
  { to: '/chat', label: 'Chat', icon: MessageCircle },
  { to: '/perfil', label: 'Perfil', icon: User },
];

export default function BottomTab() {
  // Mesma consulta que a Home e o Chat usam (o cache é compartilhado). A barra
  // aparece em todas as abas, então o aviso de mensagem nova não pode depender
  // de a pessoa estar na Home.
  const { data: unread } = useUnreadConversationsCount();
  const hasUnreadChat = (unread?.total ?? 0) > 0;

  // Na sessão do acompanhante, a aba de uma área que o titular retirou sai da
  // barra — "não mostra mais" é literal. Para o titular, todas.
  const isVisible = useScopeFilter();
  const items = ITEMS.filter((item) => isVisible(SCOPE_BY_TAB_PATH[item.to]));

  return (
    <nav
      aria-label="Navegação principal"
      // `pb-[var(--safe-bottom)]` preserva o respiro da barra de
      // gestos no iPhone — sem isso o último item fica sob a home indicator.
      className="sticky bottom-0 z-30 mt-auto bleed-x border-t border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] pb-[var(--safe-bottom)] shadow-[var(--shadow-bar)] backdrop-blur-[8px]"
    >
      {/*
       * O respiro da linha mora nesta div, e não no `ul`: o reset global
       * (`ul, ol { padding: 0 }`) fica fora de `@layer` e vence o utilitário
       * `p-*` do Tailwind, então um `p-2` no `ul` não valeria nada. É este
       * `p-2` que afasta a pastilha da aba ativa do fio de cima, da base e das
       * bordas da tela.
       */}
      <div className="p-2 pr-[calc(0.5rem_+_var(--safe-right))] pl-[calc(0.5rem_+_var(--safe-left))]">
        <ul role="list" className={cn('grid gap-1.5', GRID_COLS[items.length] ?? 'grid-cols-5')}>
          {items.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-[50px] w-full flex-col items-center justify-center gap-[3px] rounded-[14px] px-0.5 py-1.5 text-[11px] leading-tight transition-[color,background-color,box-shadow] duration-200 ease-[ease]',
                    isActive
                      ? // Pastilha da aba ativa: véu do verde da marca sobre
                        // o cartão, com o fio e a sombra de `--shadow-tab-active`.
                        'bg-[color-mix(in_srgb,var(--color-primary)_10%,var(--color-card))] font-semibold text-primary shadow-[var(--shadow-tab-active)]'
                      : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative">
                      <Icon size={20} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
                      {to === '/chat' && hasUnreadChat && (
                        // Mesma cor do contador de não lidas do Chat e da Central
                        // de Notificações: o mesmo dado não pode aparecer verde
                        // numa tela e vermelho na outra.
                        <span
                          aria-hidden="true"
                          className="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-[var(--color-supera-empatia)]"
                        />
                      )}
                    </span>
                    <span className="w-full truncate text-center">{label}</span>
                    {to === '/chat' && hasUnreadChat && (
                      <span className="sr-only">, mensagens novas</span>
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
