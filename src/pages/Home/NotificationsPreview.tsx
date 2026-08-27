import { Link } from 'react-router';
import { Bell, BookOpen, Calendar, type LucideIcon } from 'lucide-react';
import Avatar from '../../components/ui/avatar';
import { cn } from '../../lib/utils';
import type { NotificationType, NotificationWithLabel } from '../../types';

interface NotificationIconConfig {
  Icon: LucideIcon;
  bubbleClassName: string;
}

const PRIMARY_BUBBLE_CLASSNAME =
  'bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] text-primary';

const DEFAULT_ICON_CONFIG: NotificationIconConfig = {
  Icon: Bell,
  bubbleClassName: PRIMARY_BUBBLE_CLASSNAME,
};

// `chat` fica de fora de propósito: quando `tipo === 'chat'` o item sempre
// tem `autor` e renderiza o Avatar em vez deste ícone (ver `item.autor` no
// JSX abaixo) — o fallback pra `lembrete` nunca chega a aparecer na tela,
// mesma regra do `.jsx` original.
const ICON_BY_TIPO: Partial<Record<NotificationType, NotificationIconConfig>> = {
  lembrete: DEFAULT_ICON_CONFIG,
  orientacao: { Icon: BookOpen, bubbleClassName: 'bg-muted text-muted-foreground' },
  agenda: { Icon: Calendar, bubbleClassName: PRIMARY_BUBBLE_CLASSNAME },
};

function getIconConfig(tipo: NotificationType): NotificationIconConfig {
  return ICON_BY_TIPO[tipo] ?? DEFAULT_ICON_CONFIG;
}

interface NotificationsPreviewProps {
  notificacoes?: NotificationWithLabel[];
}

export default function NotificationsPreview({ notificacoes = [] }: NotificationsPreviewProps) {
  if (!notificacoes.length) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[12px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
          Notificações
        </h3>
        <Link to="/notificacoes" className="text-[12px] font-medium text-primary">
          ver todas
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        {notificacoes.map((item) => {
          const { Icon, bubbleClassName } = getIconConfig(item.tipo);

          return (
            <div
              key={item.id}
              className={cn(
                'flex items-start gap-3 rounded-xl border border-border bg-card p-[14px]',
                !item.lida &&
                  'shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary)_15%,transparent)]'
              )}
            >
              {item.tipo === 'chat' && item.autor ? (
                // Avatar ainda não foi migrado — 36px e o anel na cor
                // --color-border não têm prop equivalente, então seguem via
                // `style` (ver mesmo comentário em GreetingHeader).
                <Avatar
                  name={item.autor.nome}
                  src={item.autor.foto}
                  size="md"
                  ring
                  style={{ width: 36, height: 36, boxShadow: '0 0 0 1px var(--color-border)' }}
                />
              ) : (
                <span
                  className={cn(
                    'inline-flex flex-shrink-0 items-center justify-center rounded-lg p-2',
                    bubbleClassName
                  )}
                >
                  <Icon size={16} strokeWidth={2} />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-foreground">{item.titulo}</p>
                <p className="mt-[2px] line-clamp-2 text-[12px] text-muted-foreground">
                  {item.descricao}
                </p>
              </div>

              <span className="flex-shrink-0 text-[10px] whitespace-nowrap text-muted-foreground">
                {item.horaLabel}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
