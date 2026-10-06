import { useRef, useState, type TouchEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { Spinner } from '../../components/ui/loading';
import BottomTab from '../../components/ui/bottom-tab';
import GardenPainting from '../../components/ui/garden-painting';
import NavigationRow from '../../components/ui/navigation-row';
import { BrandStatusBand } from '../../components/ui/brand-cover';
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
import { getNpsMoment } from '../../utils/nps';
import { useSessionStore } from '../../stores/sessionStore';
import { useScopeAllowed } from '../../hooks/useCaregiver';

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
  const npsMoment = pendingNpsQuery.data ? getNpsMoment(pendingNpsQuery.data.milestoneCode) : null;

  // Na sessão do acompanhante, o bloco de uma área que o titular retirou sai da
  // Home. A leitura continua indo ao banco e volta vazia (a RLS a esconde); sem
  // esconder o bloco, a Home diria "nenhum compromisso" a quem só não pode vê-lo.
  const { allowed: scheduleAllowed } = useScopeAllowed('schedule');
  const { allowed: diaryAllowed } = useScopeAllowed('diary');

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
    // Fundo na cor-base do app: os cartões brancos se destacam dele.
    // Deitado, a tela vai até a borda (`bleed-x`) e quem recua o recorte é o
    // contêiner que rola (`px-safe-0`): recuado por fora, ele cortaria a capa
    // verde, que vai de ponta a ponta.
    // `--home-garden-h`: a altura da faixa de jardim do pé da tela — 42% da
    // largura, a proporção do modelo da Início, até 220 px (tablet, deitado).
    <div className="flex h-[100dvh] bleed-x flex-col overflow-hidden bg-background [--home-garden-h:min(42vw,220px)]">
      {/* A faixa da barra de status fica sempre na capa, fora da rolagem: o
          texto dos cartões nunca passa por baixo do relógio. Sem faixa no
          aparelho, a altura é zero. */}
      <BrandStatusBand className="relative" />
      {/* A faixa de jardim do guia ("jardim-rodape") fica presa ao pé da tela,
          logo acima da barra de abas, e o conteúdo rola por cima dela (pedido
          de 05/10: antes ela só aparecia no fim da rolagem). `isolate`: o
          jardim (`-z-10`) fica acima do fundo da tela e abaixo dos cartões,
          que são opacos, então nenhum texto fica sobre a pintura. */}
      <div className="relative isolate flex min-h-0 flex-1 flex-col">
        {/* Da largura da tela, na proporção do modelo da Início. */}
        <GardenPainting kind="band" className="absolute inset-x-0 bottom-0 -z-10 h-[var(--home-garden-h)]" />

        {/* Coluna flexível; todo filho direto é `shrink-0`: os que cortam o que
            sobra (`overflow-hidden`) perderiam o piso de altura de conteúdo e
            seriam espremidos quando a Home rola. Sem fundo próprio, para o
            jardim aparecer por trás. `relative`: o que tem posição absoluta
            lá dentro (os textos só para leitor de tela) fica preso a esta
            área; solto, esticava a página, e a tela inteira rolava com a
            barra de abas junto (o "bug da nav bar" de 05/10). */}
        <div
          ref={scrollRef}
          className="relative flex flex-1 flex-col overflow-x-clip overflow-y-auto overscroll-x-none overscroll-y-contain px-safe-0 [-webkit-overflow-scrolling:touch]"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            ref={pullIndicatorRef}
            // Com altura zero o ícone some da vista mas continuava no que o
            // leitor de tela lê, anunciando "Carregando" numa Home sem nada
            // carregando. Só conta enquanto está de fato atualizando.
            aria-hidden={!refreshing}
            // No verde da capa, para o puxar parecer a capa se abrindo.
            className="flex bleed-x shrink-0 items-center justify-center overflow-hidden bg-[var(--color-brand-cover)] text-[var(--color-on-brand-cover)] transition-[height] duration-150 ease-[ease]"
            // `refreshing` é o único caso em que o React precisa mexer nesta
            // altura (travar em PULL_THRESHOLD enquanto atualiza); durante o
            // arrasto, quem escreve é `setIndicatorHeight`, direto no nó —
            // por isso o valor aqui não muda de render em render nesse caso, e
            // o React não briga com a escrita imperativa (mesmo mecanismo do
            // exemplo de `rerender-use-ref-transient-values`).
            style={{ height: refreshing ? PULL_THRESHOLD : 0 }}
          >
            {/* `overflow-hidden` no container acima esconde o spinner sozinho
                quando a altura é 0 — não precisa de um `if` reativo aqui. Com
                24 px, o tamanho mínimo de ícone do guia: é o único sinal de que
                a Home está atualizando. */}
            <Spinner size={24} />
          </div>

          <GreetingHeader nome={fullName ?? ''} />

          {/* Os cartões começam logo abaixo da capa, na margem de 16 px das telas,
              com 24 px entre um bloco e outro. Embaixo, a altura do jardim e
              mais 16 px: no fim da rolagem o último cartão para acima da
              pintura, e ela aparece inteira. */}
          <div className="flex shrink-0 flex-col gap-6 px-4 pt-4 pb-[calc(var(--home-garden-h)_+_1rem)]">
            {scheduleAllowed && (
              <QueryBlock
                query={appointmentQuery}
                skeleton={<NextAppointmentSkeleton />}
                errorTitle="Não foi possível carregar seu próximo compromisso"
              >
                {(appointment) =>
                  appointment ? <NextAppointmentCard appointment={appointment} /> : <NextAppointmentEmpty />
                }
              </QueryBlock>
            )}

            {diaryAllowed && (
              <QueryBlock
                query={todayEntryQuery}
                skeleton={<DiarySummarySkeleton />}
                errorTitle="Não foi possível carregar o registro de hoje"
              >
                {(today) => (
                  <DiarySummaryCard registro={today.entry} sequenciaDias={today.streakDays} />
                )}
              </QueryBlock>
            )}
            <ShortcutsGrid />

            {/* Só com pesquisa aberta e ainda sem resposta: sem ela, o atalho
                levaria a uma tela sem nada para responder. */}
            {pendingNpsQuery.data && (
              // Card de lista do guia, a mesma linha dos atalhos acima. "1 de 3"
              // já avisa que a pesquisa volta em outros momentos do tratamento: o
              // atalho some depois da resposta e reaparece no próximo. `-mt-4`:
              // junta-se à lista dos atalhos, 8 px abaixo da última linha (os
              // 24 px da coluna menos 16), o vão do guia entre linhas de um grupo.
              <NavigationRow
                to="/nps"
                icon={Heart}
                title="Como está sua experiência?"
                description={
                  npsMoment?.step
                    ? `Pesquisa ${npsMoment.step} de ${npsMoment.total} · leva 20 segundos.`
                    : 'Leva 20 segundos — sua opinião ajuda a equipe.'
                }
                density="compact"
                className="-mt-4"
              />
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
      </div>

      <BottomTab />
    </div>
  );
}
