import { useRef, useState, type TouchEvent } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Heart } from 'lucide-react';
import { Spinner } from '../../components/ui/loading';
import BottomTab from '../../components/ui/bottom-tab';
import GreetingHeader from './GreetingHeader';
import NextAppointmentCard from './NextAppointmentCard';
import NextAppointmentEmpty from './NextAppointmentEmpty';
import DiarySummaryCard from './DiarySummaryCard';
import ShortcutsGrid from './ShortcutsGrid';
import NotificationsPreview from './NotificationsPreview';
import CareTeamTeaser from './CareTeamTeaser';
import QueryBlock from './QueryBlock';
import {
  CareTeamSkeleton,
  DiarySummarySkeleton,
  NextAppointmentSkeleton,
  NotificationsPreviewSkeleton,
} from './HomeSkeletons';
import { useTodayEntry } from '../../hooks/useDiary';
import { useNextAppointment } from '../../hooks/useSchedule';
import { chatKeys, useChatRealtime } from '../../hooks/useChat';
import { useNotifications, useNotificationsRealtime } from '../../hooks/useNotifications';
import { useCareTeamSummary } from '../../hooks/useCareTeam';
import { usePendingNpsSurvey } from '../../hooks/useNps';
import { useSessionStore } from '../../stores/sessionStore';

const PULL_THRESHOLD = 64;
const PULL_MAX = 96;
const NOTIFICATIONS_LIMIT = 3;

export default function Home() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pullIndicatorRef = useRef<HTMLDivElement>(null);
  // Transiente e frequente (um valor por `touchmove` do gesto) — não é
  // estado de UI que outra parte da tela leia, então fica numa ref e é
  // escrito direto no indicador, sem `setState` reconciliando a Home
  // inteira a cada milímetro de arrasto (rerender-use-ref-transient-values).
  const pullDistanceRef = useRef(0);
  const touchStartY = useRef(0);
  const pullingRef = useRef(false);
  const refreshingRef = useRef(false);

  // Nome da saudação vem direto da sessão (`accounts.full_name`, já resolvido
  // no login) — não precisa da leitura clínica completa que `usePatient`
  // traria, e fica disponível de graça, sem outra ida ao servidor.
  const fullName = useSessionStore((state) => state.fullName);

  // O indicador de mensagens novas e a prévia de notificações acompanham o
  // servidor enquanto a Home está aberta, sem esperar o foco da janela nem o
  // paciente puxar a tela. A Home nunca convive com o Chat nem com a Central,
  // que assinam os mesmos canais.
  useChatRealtime();
  useNotificationsRealtime();

  // Queries independentes em vez de um único `Promise.all` num `useEffect`:
  // cada bloco da tela cuida do próprio carregamento, do próprio erro e do
  // próprio `refetch` (ver `QueryBlock`), então uma falha não derruba a Home
  // inteira e o pull to refresh abaixo só precisa disparar os `refetch`s em
  // paralelo, sem estado manual de loading/erro.
  const appointmentQuery = useNextAppointment();
  const todayEntryQuery = useTodayEntry();
  // Só as não lidas: a prévia é o que ainda pede atenção, não um resumo
  // do que já foi visto.
  const notificationsQuery = useNotifications({ limit: NOTIFICATIONS_LIMIT, unreadOnly: true });
  const teamSummaryQuery = useCareTeamSummary();
  // Fora do loading e do erro da tela de propósito: é só o atalho da
  // pesquisa. Enquanto carrega ou se falhar, o card simplesmente não aparece
  // — não segura a Home nem acende o aviso de "não foi possível atualizar".
  const pendingNpsQuery = usePendingNpsSurvey();

  const handleRefresh = () =>
    Promise.all([
      appointmentQuery.refetch(),
      todayEntryQuery.refetch(),
      notificationsQuery.refetch(),
      teamSummaryQuery.refetch(),
      // A contagem de mensagens novas é lida pela barra inferior; aqui só é
      // relida junto com o resto.
      queryClient.refetchQueries({ queryKey: chatKeys.unreadCount() }),
      pendingNpsQuery.refetch(),
    ]);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (refreshingRef.current) return;
    if (scrollRef.current && scrollRef.current.scrollTop <= 0) {
      touchStartY.current = event.touches[0].clientY;
      pullingRef.current = true;
    } else {
      pullingRef.current = false;
    }
  };

  function setIndicatorHeight(altura: number) {
    pullDistanceRef.current = altura;
    if (pullIndicatorRef.current) {
      pullIndicatorRef.current.style.height = `${altura}px`;
    }
  }

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (!pullingRef.current || refreshingRef.current) return;
    const delta = event.touches[0].clientY - touchStartY.current;
    if (delta > 0) {
      setIndicatorHeight(Math.min(delta * 0.5, PULL_MAX));
    }
  };

  const handleTouchEnd = async () => {
    if (!pullingRef.current) return;
    pullingRef.current = false;

    if (pullDistanceRef.current >= PULL_THRESHOLD) {
      refreshingRef.current = true;
      setIndicatorHeight(PULL_THRESHOLD);
      setRefreshing(true);
      await handleRefresh();
      refreshingRef.current = false;
      setRefreshing(false);
    }

    setIndicatorHeight(0);
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={pullIndicatorRef}
          className="flex items-center justify-center overflow-hidden text-primary transition-[height] duration-150 ease-[ease]"
          // `refreshing` é o único caso em que o React precisa mexer nesta
          // altura (travar em PULL_THRESHOLD enquanto atualiza); durante o
          // arrasto, quem escreve é `setIndicatorHeight`, direto no nó —
          // por isso o valor aqui não muda de render em render nesse caso, e
          // o React não briga com a escrita imperativa (mesmo mecanismo do
          // exemplo de `rerender-use-ref-transient-values`).
          style={{ height: refreshing ? PULL_THRESHOLD : 0 }}
        >
          {/* `overflow-hidden` no container acima esconde o spinner sozinho
              quando a altura é 0 — não precisa de um `if` reativo aqui. */}
          <Spinner size="sm" />
        </div>

        <GreetingHeader nome={fullName ?? ''} />

        <div className="flex flex-col gap-4 px-6 pb-8">
          <QueryBlock
            query={appointmentQuery}
            skeleton={<NextAppointmentSkeleton />}
            errorTitle="Não foi possível carregar seu próximo compromisso"
          >
            {(appointment) =>
              appointment ? <NextAppointmentCard appointment={appointment} /> : <NextAppointmentEmpty />
            }
          </QueryBlock>

          <QueryBlock
            query={todayEntryQuery}
            skeleton={<DiarySummarySkeleton />}
            errorTitle="Não foi possível carregar o registro de hoje"
          >
            {(today) => (
              <DiarySummaryCard registro={today.entry} sequenciaDias={today.streakDays} />
            )}
          </QueryBlock>
          <ShortcutsGrid />

          {/* Só com pesquisa aberta e ainda sem resposta: sem ela, o atalho
              levaria a uma tela sem nada para responder. */}
          {pendingNpsQuery.data && (
            <Link
              to="/nps"
              className="flex items-center gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--color-supera-uniao)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-supera-uniao)_5%,transparent)] p-4 transition-[box-shadow] duration-150 ease-[ease] hover:shadow-sm"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-supera-uniao)_15%,transparent)] text-[var(--color-supera-uniao)]">
                <Heart size={18} strokeWidth={2} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-foreground">
                  Como está sua experiência?
                </p>
                <p className="mt-[2px] text-[11px] text-muted-foreground">
                  Leva 20 segundos — sua opinião ajuda a equipe.
                </p>
              </div>
              <ChevronRight
                size={16}
                strokeWidth={2}
                className="flex-shrink-0 text-[var(--color-supera-uniao)]"
                aria-hidden="true"
              />
            </Link>
          )}

          <QueryBlock
            query={notificationsQuery}
            skeleton={<NotificationsPreviewSkeleton />}
            errorTitle="Não foi possível carregar suas notificações"
          >
            {(notificacoes) => <NotificationsPreview notificacoes={notificacoes} />}
          </QueryBlock>

          <QueryBlock
            query={teamSummaryQuery}
            skeleton={<CareTeamSkeleton />}
            errorTitle="Não foi possível carregar sua equipe"
          >
            {(team) => <CareTeamTeaser specialties={team.specialties} />}
          </QueryBlock>
        </div>
      </div>

      <BottomTab />
    </div>
  );
}
