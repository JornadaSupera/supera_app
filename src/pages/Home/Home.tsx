import { useRef, useState, type TouchEvent } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Heart } from 'lucide-react';
import Loading from '../../components/ui/loading';
import { Spinner } from '../../components/ui/loading';
import BottomTab from '../../components/ui/bottom-tab';
import GreetingHeader from './GreetingHeader';
import NextAppointmentCard from './NextAppointmentCard';
import DiarySummaryCard from './DiarySummaryCard';
import ShortcutsGrid from './ShortcutsGrid';
import NotificationsPreview from './NotificationsPreview';
import CareTeamTeaser from './CareTeamTeaser';
import {
  getPatient,
  getProximoCompromisso,
  getRegistroDeHoje,
  getNotificacoes,
  getResumoEquipe,
  getConversasNaoLidas,
} from '../../services/mockApi';

const PULL_THRESHOLD = 64;
const PULL_MAX = 96;
const NOTIFICATIONS_LIMIT = 3;

export default function Home() {
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const pullingRef = useRef(false);
  const refreshingRef = useRef(false);

  // Seis queries independentes em vez de um único `Promise.all` num
  // `useEffect`: cada bloco da tela cuida do próprio carregamento (e do
  // próprio `refetch`), então o pull to refresh abaixo só precisa disparar
  // os seis `refetch`s em paralelo, sem estado manual de loading/erro.
  const patientQuery = useQuery({ queryKey: ['patient'], queryFn: getPatient });
  const appointmentQuery = useQuery({
    queryKey: ['next-appointment'],
    queryFn: getProximoCompromisso,
  });
  const todayEntryQuery = useQuery({ queryKey: ['today-entry'], queryFn: getRegistroDeHoje });
  const notificationsQuery = useQuery({
    queryKey: ['notifications', { limit: NOTIFICATIONS_LIMIT }],
    queryFn: () => getNotificacoes({ limit: NOTIFICATIONS_LIMIT }),
  });
  const teamSummaryQuery = useQuery({ queryKey: ['team-summary'], queryFn: getResumoEquipe });
  const unreadConversationsQuery = useQuery({
    queryKey: ['unread-conversations'],
    queryFn: getConversasNaoLidas,
  });

  const isInitialLoading =
    patientQuery.isLoading ||
    appointmentQuery.isLoading ||
    todayEntryQuery.isLoading ||
    notificationsQuery.isLoading ||
    teamSummaryQuery.isLoading ||
    unreadConversationsQuery.isLoading;

  const hasError =
    patientQuery.isError ||
    appointmentQuery.isError ||
    todayEntryQuery.isError ||
    notificationsQuery.isError ||
    teamSummaryQuery.isError ||
    unreadConversationsQuery.isError;

  const handleRefresh = () =>
    Promise.all([
      patientQuery.refetch(),
      appointmentQuery.refetch(),
      todayEntryQuery.refetch(),
      notificationsQuery.refetch(),
      teamSummaryQuery.refetch(),
      unreadConversationsQuery.refetch(),
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

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (!pullingRef.current || refreshingRef.current) return;
    const delta = event.touches[0].clientY - touchStartY.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.5, PULL_MAX));
    }
  };

  const handleTouchEnd = async () => {
    if (!pullingRef.current) return;
    pullingRef.current = false;

    if (pullDistance >= PULL_THRESHOLD) {
      refreshingRef.current = true;
      setRefreshing(true);
      setPullDistance(PULL_THRESHOLD);
      await handleRefresh();
      refreshingRef.current = false;
      setRefreshing(false);
    }

    setPullDistance(0);
  };

  if (isInitialLoading) return <Loading />;

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
          className="flex items-center justify-center overflow-hidden text-primary transition-[height] duration-150 ease-[ease]"
          // Altura do indicador de pull-to-refresh segue o gesto de arrasto
          // em tempo real — não há classe estática que expresse isso.
          style={{ height: refreshing ? PULL_THRESHOLD : pullDistance }}
        >
          {(pullDistance > 0 || refreshing) && <Spinner size="sm" />}
        </div>

        {patientQuery.data && <GreetingHeader nome={patientQuery.data.nome} />}

        <div className="flex flex-col gap-4 px-6 pb-8">
          {hasError && (
            <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] p-3 text-[13px] text-destructive">
              Não foi possível atualizar agora. Puxe para baixo para tentar de novo.
            </div>
          )}

          <NextAppointmentCard appointment={appointmentQuery.data ?? null} />
          <DiarySummaryCard
            registro={todayEntryQuery.data?.registro ?? null}
            sequenciaDias={todayEntryQuery.data?.sequenciaDias ?? 0}
          />
          <ShortcutsGrid mensagensNaoLidas={unreadConversationsQuery.data?.total ?? 0} />

          <Link
            to="/nps"
            className="flex items-center gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--color-supera-uniao)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-supera-uniao)_5%,transparent)] p-4 transition-[box-shadow] duration-150 ease-[ease] hover:shadow-sm"
          >
            <span className="flex flex-shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--color-supera-uniao)_15%,transparent)] p-2.5 text-[var(--color-supera-uniao)]">
              <Heart size={20} strokeWidth={2} aria-hidden="true" />
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

          <NotificationsPreview notificacoes={notificationsQuery.data ?? []} />
          <CareTeamTeaser
            equipe={teamSummaryQuery.data?.equipe ?? []}
            total={teamSummaryQuery.data?.total ?? 0}
          />
        </div>
      </div>

      <BottomTab />
    </div>
  );
}
