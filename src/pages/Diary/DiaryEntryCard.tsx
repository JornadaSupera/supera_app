import { useNavigate } from 'react-router';
import { TriangleAlert } from 'lucide-react';
import Card from '../../components/ui/card';
import Badge from '../../components/ui/badge';
import { getIntensityInfo } from '../../utils/symptoms';
import type { EnrichedDiaryEntry } from '../../types';

const MAX_SINTOMAS_VISIVEIS = 4;

interface DiaryEntryCardProps {
  registro: EnrichedDiaryEntry;
}

export default function DiaryEntryCard({ registro }: DiaryEntryCardProps) {
  const navigate = useNavigate();

  // O selo resume o registro pelo sintoma mais intenso. Registro só com texto
  // não tem intensidade — e dizer "Não senti" nesse caso seria afirmar algo
  // que o paciente não afirmou.
  const severidade = registro.severity;
  const intensidade = severidade === null ? null : getIntensityInfo(severidade);

  const sintomasVisiveis = registro.symptoms.slice(0, MAX_SINTOMAS_VISIVEIS);
  const sintomasRestantes = registro.symptoms.length - sintomasVisiveis.length;

  return (
    <Card padding="md" className="w-full text-left" onClick={() => navigate(`/diario/${registro.id}`)}>
      <div className="flex items-center justify-between">
        {intensidade ? (
          <Badge tone={`mood-${severidade}`} withDot>
            {intensidade.label}
          </Badge>
        ) : (
          <Badge tone="secondary" withDot>
            Anotação
          </Badge>
        )}
        <span className="text-[11px] text-muted-foreground">{registro.dateLabel}</span>
      </div>

      {registro.freeText && (
        <p className="mt-2 line-clamp-2 overflow-hidden text-[13px] text-foreground">
          {registro.freeText}
        </p>
      )}

      {registro.symptoms.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sintomasVisiveis.map((sintoma) => (
            <span
              key={sintoma.symptomId}
              className="rounded-full bg-muted px-2 py-[3px] text-[11px] text-muted-foreground"
            >
              {sintoma.label} · {sintoma.grade}
            </span>
          ))}
          {sintomasRestantes > 0 && (
            <span className="rounded-full bg-muted px-2 py-[3px] text-[11px] text-muted-foreground">
              +{sintomasRestantes}
            </span>
          )}
        </div>
      )}

      {registro.hasAlert && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--color-mood-4)_12%,transparent)] px-2 py-[3px] text-[11px] font-medium text-[var(--color-mood-4)]">
          <TriangleAlert size={12} strokeWidth={2.5} aria-hidden="true" />
          Sinal de atenção
        </div>
      )}
    </Card>
  );
}
