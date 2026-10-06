import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Calendar,
  CircleCheck,
  Clock,
  Lightbulb,
  MapPin,
  MessageCircle,
  Phone,
  Users,
} from 'lucide-react';
import StepHeader from '../../components/ui/step-header';
import Loading from '../../components/ui/loading';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import Button from '../../components/ui/button';
import NewConversationModal from '../Chat/NewConversationModal';
import AppointmentStatusTag from './AppointmentStatusTag';
import { useAppointment, useAppointmentConfirmation } from '../../hooks/useSchedule';
import { useConversationSubjects } from '../../hooks/useChat';
import { describeMutationError } from '../../hooks/useAuth';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import { useSessionStore } from '../../stores/sessionStore';
import { formatTimeOfDay } from '../../utils/date';
import { describeConfirmer, getAppointmentStatusTone } from '../../utils/appointments';
import { useToast } from '../../contexts/ToastContext';
import GardenPainting from '../../components/ui/garden-painting';

/** Assunto do chat para qualquer conversa sobre um compromisso. */
const SCHEDULING_SUBJECT_CODE = 'scheduling';

// As linhas de detalhe (Data, Horário, Local…): card de 14 px com a sombra única
// dos cards, o ícone solto no verde escuro, o nome do dado em legenda
// (`text-caption`, 13/18) e o valor em `text-body` (16/24). Nome e valor são
// parágrafos: `dt`/`dd` só valem dentro de um `dl`, que o ícone e o telefone
// no meio da linha não deixam montar.
const DETAIL_ROW_CLASS = 'flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm';
const DETAIL_ICON_CLASS = 'shrink-0 text-primary-deep';
const DETAIL_TEXT_CLASS = 'flex min-w-0 flex-col gap-0.5';
const DETAIL_TERM_CLASS = 'text-caption font-medium text-muted-foreground';
const DETAIL_VALUE_CLASS = 'text-body font-semibold text-foreground';

export default function AppointmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // Volta para onde a pessoa estava (Home, Notificações, Agenda); só cai na
  // Agenda quando o compromisso foi aberto direto, sem tela anterior.
  const goBack = useGoBackOr('/agenda');
  const { showToast } = useToast();

  const { data: compromisso, isLoading, isError, refetch } = useAppointment(id);
  const confirmacao = useAppointmentConfirmation();

  // Só para dizer "por você" ou "por outra pessoa": a conta de quem confirmou
  // nunca aparece na tela.
  const sessionAccountId = useSessionStore((state) => state.accountId);
  const isCaregiver = useSessionStore((state) => state.isCaregiver);

  // Remarcar é ação exclusiva da equipe e não existe pedido de remarcação do
  // paciente no banco. O caminho real é conversar com a equipe no assunto
  // "Agendamento" — por isso o botão abre o chat, e não finge enviar um pedido.
  const { data: chatSubjects } = useConversationSubjects();
  const schedulingSubject =
    chatSubjects?.find((subject) => subject.code === SCHEDULING_SUBJECT_CODE) ?? null;
  const [talkingToTeam, setTalkingToTeam] = useState(false);

  if (isLoading) {
    return <Loading />;
  }

  // Falha de leitura (rede, sessão) não é "não encontrado": só a segunda tem
  // esse texto; a primeira se resolve tentando de novo.
  if (isError && !compromisso) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <StepHeader onBack={goBack} meta="Compromisso" />
        <ErrorState
          title="Não foi possível carregar o compromisso"
          description="Verifique sua conexão e tente novamente."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (!compromisso) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <StepHeader onBack={goBack} meta="Compromisso" />
        <EmptyState
          title="Compromisso não encontrado"
          description="Esse compromisso pode ter sido removido ou remarcado."
          actionLabel="Voltar à agenda"
          onAction={() => navigate('/agenda')}
        />
      </div>
    );
  }

  const horaFim = formatTimeOfDay(new Date(compromisso.endsAt));
  const confirmado = Boolean(compromisso.confirmedAt);

  async function alternarConfirmacao(confirmar: boolean) {
    if (!compromisso) return;

    try {
      const outcome = await confirmacao.mutateAsync({ id: compromisso.id, confirm: confirmar });

      // O banco não recusa o pedido de desfazer quando o compromisso já
      // começou: só não altera nada. Anunciar "desfeita" seria mentira.
      if (outcome === 'still_confirmed') {
        showToast('A confirmação continua valendo: este compromisso já começou ou não está mais agendado.', {
          variant: 'error',
        });
        return;
      }

      showToast(
        confirmar ? 'Presença confirmada. Até lá!' : 'Confirmação desfeita.',
        { variant: 'success' }
      );
    } catch (error) {
      showToast(describeMutationError(error, 'Não foi possível atualizar sua confirmação.'), {
        variant: 'error',
      });
    }
  }

  return (
    // A tela tem a altura exata do aparelho: o cabeçalho e a pintura do pé
    // ficam fixos, e só o conteúdo rola, entre os dois (como no diário). Embaixo,
    // o recuo da barra de navegação do aparelho.
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background pb-[var(--safe-bottom)]">
      <StepHeader onBack={goBack} meta="Compromisso" />

      {/* 16 px de margem e 24 px entre os blocos (`gap`), como pede o guia.
          A área que rola: `min-h-0` para não esticar a coluna, `relative`
          para o que tem posição absoluta ficar preso nela, e `shrink-0` nos
          blocos para nenhum ser espremido. */}
      <main className="relative flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-y-contain px-4 pt-6 pb-6 [&>*]:shrink-0">
        {/* O destaque do compromisso é a caixa de informação do guia
            ("CaixaDestaque"): verde-água claro, cantos de 20 px. */}
        <section className="flex flex-col gap-1 rounded-2xl bg-secondary p-6">
          <p className="text-label font-semibold text-primary-deep">{compromisso.typeLabel}</p>
          <h1 className="text-title font-bold text-foreground">{compromisso.title}</h1>
          <p className="text-body text-foreground">{compromisso.dateLabel}</p>
          {compromisso.statusCode !== 'scheduled' && (
            <AppointmentStatusTag
              tone={getAppointmentStatusTone(compromisso.statusCode)}
              className="mt-1"
            >
              {compromisso.statusLabel}
            </AppointmentStatusTag>
          )}
        </section>

        <div className="flex flex-col gap-2">
          <div className={DETAIL_ROW_CLASS}>
            <Calendar size={24} strokeWidth={2} className={DETAIL_ICON_CLASS} aria-hidden="true" />
            <div className={DETAIL_TEXT_CLASS}>
              <p className={DETAIL_TERM_CLASS}>Data</p>
              <p className={DETAIL_VALUE_CLASS}>{compromisso.fullDateLabel}</p>
            </div>
          </div>

          <div className={DETAIL_ROW_CLASS}>
            <Clock size={24} strokeWidth={2} className={DETAIL_ICON_CLASS} aria-hidden="true" />
            <div className={DETAIL_TEXT_CLASS}>
              <p className={DETAIL_TERM_CLASS}>Horário</p>
              <p className={DETAIL_VALUE_CLASS}>
                {compromisso.time} – {horaFim} ({compromisso.durationMin} min)
              </p>
            </div>
          </div>

          <div className={DETAIL_ROW_CLASS}>
            <MapPin size={24} strokeWidth={2} className={DETAIL_ICON_CLASS} aria-hidden="true" />
            <div className={DETAIL_TEXT_CLASS}>
              <p className={DETAIL_TERM_CLASS}>Local</p>
              <p className={DETAIL_VALUE_CLASS}>{compromisso.locationLabel}</p>
              {/* Endereço e telefone existem no banco e não eram exibidos —
                  são justamente o que o paciente precisa para chegar lá. */}
              {compromisso.locationAddress && (
                <p className="text-body-sm text-muted-foreground">
                  {compromisso.locationAddress}
                </p>
              )}
              {/* A cor e o sublinhado vão no `span`: o reset global (`a { color:
                  inherit }`, fora de `@layer`) vence a classe no próprio link.
                  `min-h-12`: os 48 px de toque do guia. Dos 14 px que sobram
                  abaixo do texto, o `-mb-3.5` deixa o toque correr pelo respiro
                  do card: o card termina a 16 px do texto, como os outros, em
                  vez de 30. */}
              {compromisso.locationPhone && (
                <a
                  href={`tel:${compromisso.locationPhone}`}
                  className="-mb-3.5 inline-flex min-h-12 items-center gap-2 self-start text-label font-semibold"
                >
                  <Phone size={20} strokeWidth={2} aria-hidden="true" className="shrink-0 text-primary-deep" />
                  <span className="text-primary-deep underline underline-offset-2">
                    {compromisso.locationPhone}
                  </span>
                </a>
              )}
            </div>
          </div>

          {/* A tela mostra a ÁREA que atende, não a pessoa: o nome do
              profissional não é legível por uma sessão de paciente. */}
          {compromisso.specialty && (
            <div className={DETAIL_ROW_CLASS}>
              <Users size={24} strokeWidth={2} className={DETAIL_ICON_CLASS} aria-hidden="true" />
              <div className={DETAIL_TEXT_CLASS}>
                <p className={DETAIL_TERM_CLASS}>Atendimento</p>
                <p className={DETAIL_VALUE_CLASS}>Equipe de {compromisso.specialty.label}</p>
              </div>
            </div>
          )}

          {confirmado && (
            <div className={DETAIL_ROW_CLASS}>
              <CircleCheck size={24} strokeWidth={2} className={DETAIL_ICON_CLASS} aria-hidden="true" />
              <div className={DETAIL_TEXT_CLASS}>
                <p className={DETAIL_TERM_CLASS}>Presença</p>
                <p className={DETAIL_VALUE_CLASS}>
                  {describeConfirmer(compromisso.confirmedByAccountId, sessionAccountId, isCaregiver)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Lembrete de preparo para o paciente: o bloco `orange-soft` com o
            título em `orange-deep`, como o guia pede para lembretes da agenda. */}
        {compromisso.patientNotes && (
          <section className="flex flex-col gap-3 rounded-2xl bg-orange-soft p-6">
            <h2 className="flex items-center gap-3 text-card-title font-bold text-orange-deep">
              <Lightbulb size={24} strokeWidth={2} aria-hidden="true" className="shrink-0" />
              Observações
            </h2>
            <p className="text-body text-foreground">{compromisso.patientNotes}</p>
          </section>
        )}

        {!compromisso.isTerminal && (
          <div className="flex flex-col gap-2">
            {compromisso.canConfirm && !confirmado && (
              <Button
                fullWidth
                iconLeft={CircleCheck}
                loading={confirmacao.isPending}
                onClick={() => void alternarConfirmacao(true)}
              >
                Confirmar presença
              </Button>
            )}

            {/* Ação alternativa: o botão secundário do guia (contorno). */}
            {confirmado && compromisso.canConfirm && (
              <Button
                fullWidth
                variant="outline"
                loading={confirmacao.isPending}
                onClick={() => void alternarConfirmacao(false)}
              >
                Desfazer confirmação
              </Button>
            )}

            <Button
              fullWidth
              variant="outline"
              iconLeft={MessageCircle}
              onClick={() =>
                schedulingSubject ? setTalkingToTeam(true) : navigate('/chat')
              }
            >
              Falar com a equipe
            </Button>
          </div>
        )}
      </main>

      {/* O "jardim-canto" do guia, o mesmo do diário: no canto de baixo à
          direita, sempre inteiro na tela e fora da área que rola. A altura é
          proporcional à da tela (24%, até 260 px); numa tela baixa ele sai. */}
      <GardenPainting kind="corner" className="h-[min(24dvh,260px)] [@media(max-height:560px)]:hidden" />

      <NewConversationModal
        open={talkingToTeam}
        subject={schedulingSubject}
        initialText={`Sobre o compromisso "${compromisso.title}" (${compromisso.dateLabel}): `}
        onClose={() => setTalkingToTeam(false)}
        onCreated={(conversationId) => navigate(`/chat/${conversationId}`)}
      />
    </div>
  );
}
