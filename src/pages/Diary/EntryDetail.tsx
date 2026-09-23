import { useNavigate, useParams } from 'react-router';
import { FileText, MessageCircle } from 'lucide-react';
import StepHeader from '../../components/ui/step-header';
import Loading from '../../components/ui/loading';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import Badge from '../../components/ui/badge';
import Button from '../../components/ui/button';
import BottomTab from '../../components/ui/bottom-tab';
import AttentionBanner from './AttentionBanner';
import { useDiaryEntry } from '../../hooks/useDiary';
import { getIntensityInfo } from '../../utils/symptoms';

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
  const SummaryIcon = intensity?.icon ?? FileText;
  const summaryColor = intensity?.colorVar ?? 'var(--color-muted-foreground)';
  const summaryLabel = intensity ? `Pior sintoma: ${intensity.label}` : 'Apenas anotação';

  const fullDateLabel = `${entry.date.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
  })}${entry.time ? ` · ${entry.time}` : ''}`;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <StepHeader onBack={() => navigate('/diario')} meta="Registro do diário" />

      <main className="flex-1">
        <section className="flex flex-col items-center p-6">
          <div
            // `--mood-color` carrega a cor da intensidade para dentro das
            // fórmulas color-mix expressas como classes — mesmo mecanismo de
            // Badge/Tag (ui/).
            style={{ '--mood-color': summaryColor } as React.CSSProperties}
            className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[color-mix(in_srgb,var(--mood-color)_40%,transparent)] bg-[color-mix(in_srgb,var(--mood-color)_15%,transparent)]"
          >
            <SummaryIcon size={40} strokeWidth={1.5} color={summaryColor} aria-hidden="true" />
          </div>
          <p className="mt-3 text-center text-[18px] font-semibold tracking-[-0.3px] text-foreground">
            {summaryLabel}
          </p>
          <p className="mt-1 text-center text-[12px] text-muted-foreground">
            {fullDateLabel} · {entry.dateLabel}
          </p>
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
            <div className="mt-2 rounded-xl border border-border bg-card p-4 text-[14px] leading-[1.6] whitespace-pre-wrap text-foreground">
              {entry.freeText}
            </div>
          </section>
        )}

        {entry.symptoms.length > 0 && (
          <section className="mt-6 px-6">
            <h3 className="text-[11px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
              SINTOMAS REGISTRADOS
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {entry.symptoms.map((symptom) => {
                const level = getIntensityInfo(symptom.grade);
                const LevelIcon = level.icon;

                return (
                  <li
                    key={symptom.symptomId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-foreground">{symptom.label}</p>
                      {symptom.description && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {symptom.description}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <div
                        style={{ '--mood-color': level.colorVar } as React.CSSProperties}
                        className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[color-mix(in_srgb,var(--mood-color)_40%,transparent)] bg-[color-mix(in_srgb,var(--mood-color)_15%,transparent)]"
                      >
                        <LevelIcon
                          size={20}
                          strokeWidth={1.5}
                          color={level.colorVar}
                          aria-hidden="true"
                        />
                      </div>
                      <Badge tone="secondary" size="sm">
                        {level.label}
                      </Badge>
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
            Falar com a equipe sobre esse registro
          </Button>
        </div>
      </main>

      <BottomTab />
    </div>
  );
}
