import { NavLink } from 'react-router';
import { Activity, Calendar, BookOpen, MessageCircle, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUnreadConversationsCount } from '@/hooks/useChat';

interface TabItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** `/home` casa com prefixos de outras rotas, então exige match exato. */
  end?: boolean;
}

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

  return (
    <nav
      aria-label="Navegação principal"
      // `pb-[var(--safe-bottom)]` preserva o respiro da barra de
      // gestos no iPhone — sem isso o último item fica sob a home indicator.
      className="sticky bottom-0 z-30 mt-auto border-t border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] pb-[var(--safe-bottom)] backdrop-blur-[8px]"
    >
      <ul className="grid grid-cols-5 gap-1 p-2">
        {ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex w-full flex-col items-center gap-[2px] rounded-lg p-2 text-[10px] font-medium transition-colors duration-150 ease-[ease]',
                  isActive
                    ? 'bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] text-primary'
                    : 'text-muted-foreground hover:text-foreground'
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
                  <span>{label}</span>
                  {to === '/chat' && hasUnreadChat && (
                    <span className="sr-only">, mensagens novas</span>
                  )}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
