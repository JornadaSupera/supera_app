import type { CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Calendar, CircleCheck, Clock, Lightbulb, MapPin, Users } from 'lucide-react';
import Header from '../../components/ui/header';
import Loading from '../../components/ui/loading';
import EmptyState from '../../components/ui/empty-state';
import Button from '../../components/ui/button';
import { useAppointment, useAppointmentConfirmation } from '../../hooks/useSchedule';
import { describeMutationError } from '../../hooks/useAuth';
import { formatTimeOfDay } from '../../utils/date';
import { useToast } from '../../contexts/ToastContext';

export default function AppointmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: compromisso, isLoading, isError } = useAppointment(id);
  const confirmacao = useAppointmentConfirmation();

  if (isLoading) {
    return <Loading />;
  }

  if (isError || !compromisso) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <Header
          variant="step"
          sticky
          bordered
          blurred
          onBack={() => navigate('/agenda')}
          meta="Compromisso"
        />
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
      await confirmacao.mutateAsync({ id: compromisso.id, confirm: confirmar });
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
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Header
        variant="step"
        sticky
        bordered
        blurred
        onBack={() => navigate('/agenda')}
        meta="Compromisso"
      />

      <main className="flex-1 px-6 pb-6">
        <section
          className="mt-5 rounded-2xl border p-5"
          // Cor de fundo/borda do destaque varia por tipo/especialidade do
          // compromisso (`colorVar`) — sem classe Tailwind estática
          // equivalente, mesma exceção usada em badge.tsx/tag.tsx.
          style={
            {
              backgroundColor: `color-mix(in srgb, ${compromisso.colorVar} 10%, transparent)`,
              borderColor: `color-mix(in srgb, ${compromisso.colorVar} 25%, transparent)`,
            } as CSSProperties
          }
        >
          <p
            className="text-[11px] font-medium tracking-[0.05em] uppercase"
            style={{ color: compromisso.colorVar } as CSSProperties}
          >
            {compromisso.typeLabel}
          </p>
          <h2 className="mt-1 text-[20px] font-semibold text-foreground">{compromisso.title}</h2>
          <p className="mt-1.5 text-[14px] text-muted-foreground">{compromisso.dateLabel}</p>
          {compromisso.statusCode !== 'scheduled' && (
            <p className="mt-1 text-[12px] font-medium text-muted-foreground">
              {compromisso.statusLabel}
            </p>
          )}
        </section>

        <div className="mt-5 flex flex-col gap-2">
          <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
            <Calendar
              size={16}
              strokeWidth={2}
              className="mt-0.5 flex-shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <dt className="m-0 text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
                Data
              </dt>
              <dd className="mt-0.5 mr-0 mb-0 ml-0 text-[14px] font-medium text-foreground">
                {compromisso.fullDateLabel}
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
            <Clock
              size={16}
              strokeWidth={2}
              className="mt-0.5 flex-shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <dt className="m-0 text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
                Horário
              </dt>
              <dd className="mt-0.5 mr-0 mb-0 ml-0 text-[14px] font-medium text-foreground">
                {compromisso.time} – {horaFim} ({compromisso.durationMin} min)
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
            <MapPin
              size={16}
              strokeWidth={2}
              className="mt-0.5 flex-shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <dt className="m-0 text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
                Local
              </dt>
              <dd className="mt-0.5 mr-0 mb-0 ml-0 text-[14px] font-medium text-foreground">
                {compromisso.locationLabel}
              </dd>
              {/* Endereço e telefone existem no banco e não eram exibidos —
                  são justamente o que o paciente precisa para chegar lá. */}
              {compromisso.locationAddress && (
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {compromisso.locationAddress}
                </p>
              )}
              {compromisso.locationPhone && (
                <a
                  href={`tel:${compromisso.locationPhone}`}
                  className="mt-0.5 inline-block text-[12px] font-medium text-primary"
                >
                  {compromisso.locationPhone}
                </a>
              )}
            </div>
          </div>

          {/* A tela mostra a ÁREA que atende, não a pessoa: o nome do
              profissional não é legível por uma sessão de paciente. */}
          {compromisso.specialty && (
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
              <Users
                size={16}
                strokeWidth={2}
                className="mt-0.5 flex-shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <dt className="m-0 text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
                  Atendimento
                </dt>
                <dd className="mt-0.5 mr-0 mb-0 ml-0 text-[14px] font-medium text-foreground">
                  Equipe de {compromisso.specialty.label}
                </dd>
              </div>
            </div>
          )}

          {confirmado && (
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
              <CircleCheck
                size={16}
                strokeWidth={2}
                className="mt-0.5 flex-shrink-0 text-[var(--color-mood-0)]"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <dt className="m-0 text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
                  Presença
                </dt>
                <dd className="mt-0.5 mr-0 mb-0 ml-0 text-[14px] font-medium text-foreground">
                  Confirmada por você
                </dd>
              </div>
            </div>
          )}
        </div>

        {compromisso.patientNotes && (
          <section className="mt-4 rounded-xl border border-border bg-card p-3.5">
            <p className="text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
              OBSERVAÇÕES
            </p>
            <p className="mt-1.5 flex items-start gap-2 text-[14px]/[1.6] text-foreground">
              <Lightbulb
                size={16}
                strokeWidth={2}
                className="mt-1 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span>{compromisso.patientNotes}</span>
            </p>
          </section>
        )}

        {!compromisso.isTerminal && (
          <div className="mt-6 flex flex-col gap-2">
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

            {confirmado && compromisso.canConfirm && (
              <Button
                fullWidth
                variant="ghost"
                loading={confirmacao.isPending}
                onClick={() => void alternarConfirmacao(false)}
              >
                Desfazer confirmação
              </Button>
            )}

            <Button
              fullWidth
              variant="outline"
              onClick={() =>
                showToast('Solicitação enviada. Nossa equipe vai entrar em contato para remarcar.', {
                  variant: 'info',
                })
              }
            >
              Solicitar remarcação
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
