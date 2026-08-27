import { useNavigate } from 'react-router';
import { TriangleAlert } from 'lucide-react';
import Card from '../../components/ui/card';
import Badge from '../../components/ui/badge';
import { getMoodInfo } from '../../utils/mood';
import type { EnrichedDiaryEntry } from '../../types';

const MAX_SINTOMAS_VISIVEIS = 4;

interface DiaryEntryCardProps {
  registro: EnrichedDiaryEntry;
}

export default function DiaryEntryCard({ registro }: DiaryEntryCardProps) {
  const navigate = useNavigate();
  const mood = getMoodInfo(registro.grau);

  const sintomasVisiveis = registro.sintomas.slice(0, MAX_SINTOMAS_VISIVEIS);
  const sintomasRestantes = registro.sintomas.length - sintomasVisiveis.length;

  return (
    <Card padding="md" className="w-full text-left" onClick={() => navigate(`/diario/${registro.id}`)}>
      <div className="flex items-center justify-between">
        <Badge tone={`mood-${registro.grau}`} withDot>
          {mood.label}
        </Badge>
        <span className="text-[11px] text-muted-foreground">{registro.dataLabel}</span>
      </div>

      {registro.texto && (
        <p className="mt-2 line-clamp-2 overflow-hidden text-[13px] text-foreground">{registro.texto}</p>
      )}

      {registro.sintomas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sintomasVisiveis.map((sintoma) => (
            <span
              key={sintoma.nome}
              className="rounded-full bg-muted px-2 py-[3px] text-[11px] text-muted-foreground"
            >
              {sintoma.nome} · {sintoma.intensidade}
            </span>
          ))}
          {sintomasRestantes > 0 && (
            <span className="rounded-full bg-muted px-2 py-[3px] text-[11px] text-muted-foreground">
              +{sintomasRestantes}
            </span>
          )}
        </div>
      )}

      {registro.temAlerta && (
        <div
          className="mt-2 inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--color-mood-4)_12%,transparent)] px-2 py-[3px] text-[11px] font-medium text-[var(--color-mood-4)]"
        >
          <TriangleAlert size={12} strokeWidth={2.5} aria-hidden="true" />
          Sinal de atenção
        </div>
      )}
    </Card>
  );
}
