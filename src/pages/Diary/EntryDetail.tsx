import type { CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router';
import { FileText, MessageCircle } from 'lucide-react';
import StepHeader from '../../components/ui/step-header';
import Loading from '../../components/ui/loading';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import Button from '../../components/ui/button';
import BottomTab from '../../components/ui/bottom-tab';
import IntensityEmoji from '../../components/ui/intensity-emoji';
import AttentionBanner from './AttentionBanner';
import { useDiaryEntry } from '../../hooks/useDiary';
import { getIntensityInfo } from '../../utils/symptoms';
import { formatRelativeDay } from '../../utils/date';
import { cn } from '../../lib/utils';

const INTENSITY_STEPS = [1, 2, 3, 4, 5];

/**
 * A intensidade em cinco tracinhos, preenchidos até o grau: dá para comparar
 * os sintomas de relance, sem ler o rótulo. Decorativo para o leitor de tela,
 * que ouve o grau por extenso.
 */
function IntensityMeter({ grade }: { grade: number }) {
  return (
    <span className="flex gap-0.5">
      <span aria-hidden="true" className="flex gap-0.5">
        {INTENSITY_STEPS.map((step) => (
          <span
            key={step}
            className={cn('h-1.5 w-3 rounded-full', step <= grade ? 'bg-[var(--mood-color)]' : 'bg-muted')}
          />
        ))}
      </span>
      <span className="sr-only">, grau {grade} de 5</span>
    </span>
  );
}

export default function EntryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: entry, isLoading, isError, refetch } = useDiaryEntry(id);

  if (isLoading) {
    return <Loading />;
  }

  // Falha de leitura (rede, sessão) não é "não encontrado": só a segunda tem
  // esse texto; a primeira se resolve tentando de novo.
  if (isError && !entry) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <StepHeader onBack={() => navigate('/diario')} meta="Registro do diário" />
        <ErrorState
          title="Não foi possível carregar o registro"
          description="Verifique sua conexão e tente novamente."
          onRetry={() => void refetch()}
        />
        <BottomTab />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <StepHeader onBack={() => navigate('/diario')} meta="Registro do diário" />
        <EmptyState
          title="Registro não encontrado"
          description="Esse registro não existe ou não está disponível para você."
          actionLabel="Voltar ao diário"
          onAction={() => navigate('/diario')}
        />
        <BottomTab />
      </div>
    );
  }

  // O resumo do registro é o sintoma mais intenso — não uma autoavaliação do
  // paciente, que não existe no banco. Registro só com texto não tem grau.
  const severity = entry.severity;
  const intensity = severity === null ? null : getIntensityInfo(severity);
  const summaryColor = intensity?.colorVar ?? 'var(--color-muted-foreground)';

  // "23 de setembro · 12:00 · Hoje": a data, a hora e, na última semana, há
  // quanto tempo. Antes o rótulo da lista vinha junto e repetia a hora.
  const fullDateLabel = [
    entry.date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }),
    entry.time,
    formatRelativeDay(entry.date),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <StepHeader onBack={() => navigate('/diario')} meta="Registro do diário" />

      <main className="flex-1">
        {/* `--mood-color` carrega a cor da intensidade para dentro das
            fórmulas color-mix expressas como classes — mesmo mecanismo de
            Badge/Tag (ui/). */}
        <section
          className="flex flex-col items-center gap-1 p-6"
          style={{ '--mood-color': summaryColor } as CSSProperties}
        >
          {severity !== null ? (
            // O emoji 3D sobre um halo da cor da intensidade, no lugar da
            // carinha de traço dentro de um anel.
            <div className="relative mb-2 grid place-items-center">
              <span
                aria-hidden="true"
                className="absolute inset-[-22%] rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--mood-color)_30%,transparent),transparent)]"
              />
              <IntensityEmoji grade={severity} size="lg" className="relative" />
            </div>
          ) : (
            <div className="mb-2 flex size-20 items-center justify-center rounded-full border-2 border-border bg-muted">
              <FileText size={36} strokeWidth={1.5} aria-hidden="true" className="text-muted-foreground" />
            </div>
          )}
          <p className="text-center text-[18px] font-semibold tracking-[-0.3px] text-foreground">
            {intensity ? (
              <>
                Pior sintoma:{' '}
                <span className="text-[color-mix(in_srgb,var(--mood-color)_78%,var(--color-foreground))]">
                  {intensity.label}
                </span>
              </>
            ) : (
              'Apenas anotação'
            )}
          </p>
          <p className="text-center text-[12px] text-muted-foreground">{fullDateLabel}</p>
        </section>

        {entry.hasAlert && (
          <div className="px-6">
            <AttentionBanner title="Este registro tem sintomas fortes" />
          </div>
        )}

        {entry.freeText && (
          <section className="mt-6 px-6">
            <h3 className="text-[11px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
              TEXTO LIVRE
            </h3>
            <div className="mt-2 rounded-2xl border border-border bg-card p-4 text-[14px] leading-[1.6] whitespace-pre-wrap text-foreground shadow-sm">
              {entry.freeText}
            </div>
          </section>
        )}

        {entry.symptoms.length > 0 && (
          <section className="mt-6 px-6">
            <h3 className="text-[11px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
              SINTOMAS REGISTRADOS
            </h3>
            <ul className="mt-2 flex flex-col gap-2.5">
              {entry.symptoms.map((symptom) => {
                const level = getIntensityInfo(symptom.grade);

                return (
                  <li
                    key={symptom.symptomId}
                    style={{ '--mood-color': level.colorVar } as CSSProperties}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-sm"
                  >
                    <IntensityEmoji grade={symptom.grade} size="sm" />

                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="text-[15px] font-semibold text-foreground">{symptom.label}</p>
                      {symptom.description && (
                        <p className="text-[12px]/[1.4] text-muted-foreground">{symptom.description}</p>
                      )}
                    </div>

                    {/* O rótulo na cor da intensidade, escurecida em direção
                        ao texto para passar em contraste até no amarelo. */}
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="rounded-full bg-[color-mix(in_srgb,var(--mood-color)_15%,transparent)] px-2.5 py-1 text-[12.5px] font-semibold text-[color-mix(in_srgb,var(--mood-color)_72%,var(--color-foreground))]">
                        {level.label}
                      </span>
                      <IntensityMeter grade={symptom.grade} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="mt-8 px-6 pb-6">
          <Button
            fullWidth
            variant="outline"
            iconLeft={MessageCircle}
            onClick={() => navigate('/chat')}
          >
            Falar com a equipe
          </Button>
        </div>
      </main>

      <BottomTab />
    </div>
  );
}
