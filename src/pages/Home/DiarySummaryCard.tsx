import { useNavigate } from 'react-router';
import { ArrowRight, FileText, Heart, NotebookPen } from 'lucide-react';
import Card from '../../components/ui/card';
import Badge from '../../components/ui/badge';
import Button from '../../components/ui/button';
import IconTile from '../../components/ui/icon-tile';
import { getIntensityInfo } from '../../utils/symptoms';
import type { EnrichedDiaryEntry } from '../../types';

interface DiarySummaryCardProps {
  registro: EnrichedDiaryEntry | null;
  sequenciaDias?: number;
}

export default function DiarySummaryCard({ registro, sequenciaDias = 0 }: DiarySummaryCardProps) {
  const navigate = useNavigate();

  if (!registro) {
    return (
      <Card elevation="raised" padding="md">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <IconTile icon={NotebookPen} size="md" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h3 className="text-[17px]/[1.3] font-semibold text-foreground">Como você está hoje?</h3>
              <p className="text-[13.5px]/[1.5] text-muted-foreground">
                Registrar como você está ajuda sua equipe a te acompanhar melhor.
              </p>
            </div>
          </div>
          <Button fullWidth onClick={() => navigate('/diario/novo')}>
            Fazer registro de hoje
          </Button>
        </div>
      </Card>
    );
  }

  // Resumo pelo sintoma mais intenso do registro. Registro só com texto não
  // tem grau — mostra a anotação, sem inventar uma intensidade.
  const severidade = registro.severity;
  const intensidade = severidade === null ? null : getIntensityInfo(severidade);
  const ResumoIcon = intensidade?.icon ?? FileText;
  const resumoCor = intensidade?.colorVar ?? 'var(--color-muted-foreground)';
  const resumoTexto = intensidade ? intensidade.label : 'uma anotação';

  const primeiroSintoma = registro.symptoms[0];

  return (
    <Card elevation="raised" padding="md" onClick={() => navigate(`/diario/${registro.id}`)}>
      <div className="flex items-start gap-4">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-[16px]"
          // Cor da intensidade vem de uma tabela (grau -> cor) resolvida em
          // tempo de execução — sem classe Tailwind estática que a expresse.
          style={{
            backgroundColor: `color-mix(in srgb, ${resumoCor} 15%, transparent)`,
            boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${resumoCor} 40%, transparent)`,
            color: resumoCor,
          }}
          aria-hidden="true"
        >
          <ResumoIcon size={24} strokeWidth={2} aria-hidden="true" />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-[12.5px] font-semibold text-[var(--color-supera-seguranca)]">Seu registro de hoje</p>
          <h3 className="text-[17px]/[1.3] font-semibold tracking-[-0.3px] text-foreground">
            Você registrou hoje: <span style={{ color: resumoCor }}>{resumoTexto}</span>
          </h3>

          {registro.freeText && (
            <p className="line-clamp-2 text-[14px] text-muted-foreground">{registro.freeText}</p>
          )}

          {primeiroSintoma && (
            <div className="flex flex-wrap gap-1">
              <Badge tone="secondary" size="sm">
                {primeiroSintoma.label} · {primeiroSintoma.grade}
              </Badge>
            </div>
          )}

          <span className="inline-flex items-center gap-2 pt-1 text-[13.5px] font-semibold text-[var(--color-supera-seguranca)]">
            Ver detalhes
            <span
              aria-hidden="true"
              className="inline-flex size-6 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] text-primary"
            >
              <ArrowRight size={13} strokeWidth={2.2} />
            </span>
          </span>
        </div>
      </div>

      {sequenciaDias > 1 && (
        <div className="mt-4 flex items-center gap-2.5 rounded-[14px] bg-[color-mix(in_srgb,var(--color-supera-empatia)_12%,transparent)] px-3.5 py-2.5">
          <Heart
            size={15}
            strokeWidth={2.5}
            fill="currentColor"
            aria-hidden="true"
            className="shrink-0 text-[var(--color-supera-empatia)]"
          />
          <p className="text-[12.5px]/[1.45] text-muted-foreground">
            <strong className="text-foreground">{sequenciaDias} dias seguidos</strong> registrando.
            Sua equipe agradece por compartilhar.
          </p>
        </div>
      )}
    </Card>
  );
}
