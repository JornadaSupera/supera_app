import type { CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Clock, MapPin, User, Bell } from 'lucide-react';
import Header from '../../components/ui/header';
import Loading from '../../components/ui/loading';
import EmptyState from '../../components/ui/empty-state';
import Button from '../../components/ui/button';
import { getCompromissoPorId } from '../../services/mockApi';
import { useToast } from '../../contexts/ToastContext';

function calcularHoraFim(hora: string, duracaoMin: number): string {
  const [horas, minutos] = hora.split(':').map(Number);
  const totalMinutos = horas * 60 + minutos + duracaoMin;
  const horaFim = Math.floor((totalMinutos % 1440) / 60);
  const minutoFim = totalMinutos % 60;
  return `${String(horaFim).padStart(2, '0')}:${String(minutoFim).padStart(2, '0')}`;
}

export default function AppointmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const {
    data: compromisso,
    isLoading: carregando,
    isError: erro,
  } = useQuery({
    queryKey: ['appointment', id],
    queryFn: () => getCompromissoPorId(id as string),
    enabled: Boolean(id),
  });

  if (carregando) {
    return <Loading />;
  }

  if (erro || !compromisso) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <Header
          variant="step"
          sticky
          bordered
          blurred
          onBack={() => navigate('/agenda')}
          meta="Compromisso"
          // Header.jsx (ainda não migrado) desestrutura title/subtitle/actions
          // sem valor padrão, então o TS os infere como obrigatórios para quem
          // consome de um .tsx, mesmo não usados na variante "step" — mesmo
          // padrão de DiaryTimeline.tsx / EntryDetail.tsx.
          title={undefined}
          subtitle={undefined}
          actions={undefined}
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

  const horaFim = calcularHoraFim(compromisso.hora, compromisso.duracaoMin);
  const jaRealizado = compromisso.status === 'realizado';

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Header
        variant="step"
        sticky
        bordered
        blurred
        onBack={() => navigate('/agenda')}
        meta="Compromisso"
        title={undefined}
        subtitle={undefined}
        actions={undefined}
      />

      <main className="flex-1 px-6 pb-6">
        <section
          className="mt-5 rounded-2xl border p-5"
          // Cor de fundo/borda do destaque varia por categoria do compromisso
          // (`colorVar`) — sem classe Tailwind estática equivalente, mesma
          // exceção usada em badge.tsx/tag.tsx.
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
            {compromisso.descricaoCategoria}
          </p>
          <h2 className="mt-1 text-[20px] font-semibold text-foreground">{compromisso.titulo}</h2>
          <p className="mt-1.5 text-[14px] text-muted-foreground">{compromisso.dataLabel}</p>
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
                {compromisso.dataCompletaLabel}
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
                {compromisso.hora} – {horaFim} ({compromisso.duracaoMin} min)
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
                {compromisso.local}
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
            <User
              size={16}
              strokeWidth={2}
              className="mt-0.5 flex-shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <dt className="m-0 text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
                Profissional
              </dt>
              <dd className="mt-0.5 mr-0 mb-0 ml-0 text-[14px] font-medium text-foreground">
                {compromisso.profissional
                  ? `${compromisso.profissional.cargo} ${compromisso.profissional.nome}`
                  : '—'}
              </dd>
            </div>
          </div>

          {!jaRealizado && (
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
              <Bell
                size={16}
                strokeWidth={2}
                className="mt-0.5 flex-shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <dt className="m-0 text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
                  Lembretes
                </dt>
                <dd className="mt-0.5 mr-0 mb-0 ml-0 text-[14px] font-medium text-foreground">
                  Push 24h e 2h antes
                </dd>
              </div>
            </div>
          )}
        </div>

        {compromisso.observacoes && (
          <section className="mt-4 rounded-xl border border-border bg-card p-4">
            <p className="text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
              OBSERVAÇÕES
            </p>
            <p className="mt-1.5 text-[14px]/[1.6] text-foreground">💡 {compromisso.observacoes}</p>
          </section>
        )}

        {!jaRealizado && (
          <div className="mt-6">
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
