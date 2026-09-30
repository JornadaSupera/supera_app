import { useNavigate } from 'react-router';
import { ArrowRight, FileText, Heart, NotebookPen } from 'lucide-react';
import Card from '../../components/ui/card';
import Badge from '../../components/ui/badge';
import Button from '../../components/ui/button';
import IconTile from '../../components/ui/icon-tile';
import IntensityEmoji from '../../components/ui/intensity-emoji';
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
  const resumoCor = intensidade?.colorVar ?? 'var(--color-muted-foreground)';
  const resumoTexto = intensidade ? intensidade.label : 'uma anotação';

  const primeiroSintoma = registro.symptoms[0];

  return (
    <Card elevation="raised" padding="md" onClick={() => navigate(`/diario/${registro.id}`)}>
      <div className="flex items-start gap-4">
        {/* O emoji 3D da intensidade, sem pastilha: ele já é colorido. Registro
            só com texto não tem grau, e fica com o ícone da anotação. */}
        {severidade !== null ? (
          <IntensityEmoji grade={severidade} size="md" />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-13 shrink-0 items-center justify-center rounded-[16px] bg-muted text-muted-foreground"
          >
            <FileText size={24} strokeWidth={2} aria-hidden="true" />
          </span>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-[12.5px] font-semibold text-[var(--color-supera-seguranca)]">Seu registro de hoje</p>
          <h3 className="text-[17px]/[1.3] font-semibold tracking-[-0.3px] text-foreground">
            {/* Cor da intensidade vem de uma tabela (grau -> cor) resolvida em
                tempo de execução — sem classe Tailwind estática que a expresse. */}
            Você registrou hoje: <span style={{ color: resumoCor }}>{resumoTexto}</span>
          </h3>

          {registro.freeText && (
            <p className="line-clamp-2 text-[14px] text-muted-foreground">{registro.freeText}</p>
          )}

          {/* O sintoma à esquerda e o "Ver detalhes" na borda direita do
              cartão (pedido de 30/09). Sem sintoma, o "Ver detalhes" continua
              à direita. */}
          <div className="flex items-center justify-between gap-3 pt-1">
            {primeiroSintoma && (
              <Badge tone="secondary" size="sm" className="min-w-0 truncate">
                {primeiroSintoma.label} · {primeiroSintoma.grade}
              </Badge>
            )}

            <span className="ml-auto inline-flex shrink-0 items-center gap-2 text-[13.5px] font-semibold text-[var(--color-supera-seguranca)]">
              Ver detalhes
              <span
                aria-hidden="true"
                className="inline-flex size-7 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] text-primary"
              >
                <ArrowRight size={14} strokeWidth={2.2} />
              </span>
            </span>
          </div>
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
