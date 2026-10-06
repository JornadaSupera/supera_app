import { useRef, type CSSProperties, type TouchEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { CircleCheck } from 'lucide-react';
import SectionHeading from '../../components/ui/section-heading';
import { useMarkNotificationRead } from '../../hooks/useNotifications';
import type { NotificationDetail } from '../../types';

/** Distância de arrasto que conta como "deslizar", e não como toque torto. */
const SWIPE_THRESHOLD = 60;

interface NotificationsPreviewProps {
  notificacoes?: NotificationDetail[];
}

/**
 * Prévia da Home: só o que ainda não foi lido.
 *
 * O mapa contratado pede marcar como lida por toque ou deslizando. O toque
 * abre o registro de origem e marca junto; deslizar para o lado marca sem
 * sair da Home, para quem só quer limpar a lista.
 */
export default function NotificationsPreview({ notificacoes = [] }: NotificationsPreviewProps) {
  const navigate = useNavigate();
  const marcarComoLida = useMarkNotificationRead();
  const toqueInicialX = useRef(0);

  function aoTocar(item: NotificationDetail) {
    marcarComoLida.mutate(item.id);
    if (item.destination) navigate(item.destination);
  }

  return (
    // `mt-2`: somado ao vão de 24 px da Home, dá os 32 px do guia entre seções.
    <section aria-labelledby="home-notifications-title" className="mt-2 flex flex-col gap-3">
      <SectionHeading
        id="home-notifications-title"
        action={
          // A cor vai no `span`: o reset global de `a` anula a cor posta no próprio link.
          // Toque de 48 px; o `-my-0.5` desfaz o `py-0.5` da faixa, que segue com 48 px.
          <Link
            to="/notificacoes"
            className="-my-0.5 inline-flex min-h-12 items-center text-label font-semibold"
          >
            <span className="text-primary-deep">Ver todas</span>
          </Link>
        }
      >
        Notificações
      </SectionHeading>

      {notificacoes.length === 0 ? (
        // Antes a seção sumia quando não havia nada não lido, e quem esperava um
        // aviso não sabia se não existia ou se a lista tinha falhado. O ícone
        // acompanha o texto, nunca o substitui, e fica na primeira linha da
        // frase, como no aviso (`Toast`): o `-my-[1.5px]` centra os 24 px na
        // linha de 21 px do `text-body-sm`.
        <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
          <CircleCheck
            size={24}
            strokeWidth={2}
            aria-hidden="true"
            className="-my-[1.5px] shrink-0 text-primary-deep"
          />
          <p className="text-body-sm text-muted-foreground">Você está em dia: nenhuma notificação nova.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {notificacoes.map((item) => {
            const Icon = item.categoryInfo.icon;

            function aoIniciarToque(evento: TouchEvent<HTMLButtonElement>) {
              toqueInicialX.current = evento.touches[0].clientX;
            }

            function aoTerminarToque(evento: TouchEvent<HTMLButtonElement>) {
              const distancia = Math.abs(
                evento.changedTouches[0].clientX - toqueInicialX.current
              );
              // Deslizou: marca como lida e fica na Home.
              if (distancia > SWIPE_THRESHOLD) {
                evento.preventDefault();
                marcarComoLida.mutate(item.id);
              }
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => aoTocar(item)}
                onTouchStart={aoIniciarToque}
                onTouchEnd={aoTerminarToque}
                // Card de lista do guia. "Não lida" é o ponto laranja com rótulo
                // para o leitor de tela, e não um anel em volta do card.
                className="flex min-h-12 w-full cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4 text-left shadow-sm [touch-action:pan-y]"
              >
                {/* O alinhamento de `NotificationItem.tsx`: o ícone de 24 px tem
                    a altura da primeira linha do título (`text-body`, 24 px) e
                    fica centrado nela sem ajuste. */}
                <span
                  className="inline-flex shrink-0 text-[var(--notification-icon-color)]"
                  // Exceção deliberada à regra de não usar `style` inline: a cor
                  // varia por instância (uma por categoria) — mesmo padrão de
                  // `--notification-icon-color` usado em `NotificationItem.tsx`.
                  style={{ '--notification-icon-color': item.categoryInfo.colorVar } as CSSProperties}
                >
                  <Icon size={24} strokeWidth={2} aria-hidden="true" />
                </span>

                <span className="min-w-0 flex-1">
                  {/* O título quebra a linha, como na Central: cortado, perdia
                      a palavra que diz o assunto. */}
                  <span className="block break-words text-body font-semibold text-foreground">
                    {item.title}
                  </span>
                  {/* A linha de `notifications` não tem texto: a prévia é
                      montada a partir do registro de origem. */}
                  {item.preview && (
                    <span className="mt-0.5 block truncate text-body-sm text-muted-foreground">
                      {item.preview}
                    </span>
                  )}
                </span>

                {/* `pt-[3px]` centra a linha da hora (`text-caption`, 18 px) na
                    primeira linha do título (24 px). */}
                <span className="flex shrink-0 flex-col items-end gap-2 pt-[3px]">
                  <span className="text-caption font-medium whitespace-nowrap text-muted-foreground">
                    {item.timeLabel}
                  </span>
                  {!item.isRead && (
                    <>
                      <span aria-hidden="true" className="size-2.5 rounded-full bg-orange" />
                      <span className="sr-only">Não lida</span>
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
