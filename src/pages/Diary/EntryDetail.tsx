import { useNavigate, useParams } from 'react-router';
import { FileText, MessageCircle } from 'lucide-react';
import Header from '../../components/ui/header';
import Loading from '../../components/ui/loading';
import EmptyState from '../../components/ui/empty-state';
import Badge from '../../components/ui/badge';
import Button from '../../components/ui/button';
import BottomTab from '../../components/ui/bottom-tab';
import { useDiaryEntry } from '../../hooks/useDiary';
import { getIntensityInfo } from '../../utils/symptoms';

export default function EntryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: registro, isLoading, isError } = useDiaryEntry(id);

  if (isLoading) {
    return <Loading />;
  }

  if (isError || !registro) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <Header
          variant="step"
          sticky
          bordered
          blurred
          onBack={() => navigate('/diario')}
          meta="Registro do diário"
        />
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
  const severidade = registro.severity;
  const intensidade = severidade === null ? null : getIntensityInfo(severidade);
  const ResumoIcon = intensidade?.icon ?? FileText;
  const resumoCor = intensidade?.colorVar ?? 'var(--color-muted-foreground)';
  const resumoLabel = intensidade ? `Pior sintoma: ${intensidade.label}` : 'Apenas anotação';

  const dataCompletaLabel = `${registro.date.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
  })}${registro.time ? ` · ${registro.time}` : ''}`;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Header
        variant="step"
        sticky
        bordered
        blurred
        onBack={() => navigate('/diario')}
        meta="Registro do diário"
      />

      <main className="flex-1">
        <section className="flex flex-col items-center p-6">
          <div
            // `--mood-color` carrega a cor da intensidade para dentro das
            // fórmulas color-mix expressas como classes — mesmo mecanismo de
            // Badge/Tag (ui/).
            style={{ '--mood-color': resumoCor } as React.CSSProperties}
            className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[color-mix(in_srgb,var(--mood-color)_40%,transparent)] bg-[color-mix(in_srgb,var(--mood-color)_15%,transparent)]"
          >
            <ResumoIcon size={40} strokeWidth={1.5} color={resumoCor} aria-hidden="true" />
          </div>
          <p className="mt-3 text-center text-[18px] font-semibold tracking-[-0.3px] text-foreground">
            {resumoLabel}
          </p>
          <p className="mt-1 text-center text-[12px] text-muted-foreground">
            {dataCompletaLabel} · {registro.dateLabel}
          </p>
        </section>

        {registro.freeText && (
          <section className="mt-6 px-6">
            <h3 className="text-[11px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
              TEXTO LIVRE
            </h3>
            <div className="mt-2 rounded-xl border border-border bg-card p-4 text-[14px] leading-[1.6] whitespace-pre-wrap text-foreground">
              {registro.freeText}
            </div>
          </section>
        )}

        {registro.symptoms.length > 0 && (
          <section className="mt-6 px-6">
            <h3 className="text-[11px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
              SINTOMAS REGISTRADOS
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {registro.symptoms.map((sintoma) => {
                const grau = getIntensityInfo(sintoma.grade);
                const GrauIcon = grau.icon;

                return (
                  <li
                    key={sintoma.symptomId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-foreground">{sintoma.label}</p>
                      {sintoma.description && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {sintoma.description}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <div
                        style={{ '--mood-color': grau.colorVar } as React.CSSProperties}
                        className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[color-mix(in_srgb,var(--mood-color)_40%,transparent)] bg-[color-mix(in_srgb,var(--mood-color)_15%,transparent)]"
                      >
                        <GrauIcon
                          size={20}
                          strokeWidth={1.5}
                          color={grau.colorVar}
                          aria-hidden="true"
                        />
                      </div>
                      <Badge tone="secondary" size="sm">
                        {grau.label}
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
