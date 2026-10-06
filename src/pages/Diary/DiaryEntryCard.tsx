import { useNavigate } from 'react-router';
import { TriangleAlert } from 'lucide-react';
import Card from '../../components/ui/card';
import Tag from '../../components/ui/tag';
import { getIntensityInfo, isAlertGrade } from '../../utils/symptoms';
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
  //
  // Só a tinta e as cores funcionais do guia: o grau em verde escuro, e no
  // vermelho de alarme a partir do grau de atenção — sempre com o rótulo
  // ("Forte"), nunca só a cor.
  const severidade = registro.severity;

  const sintomasVisiveis = registro.symptoms.slice(0, MAX_SINTOMAS_VISIVEIS);
  const sintomasRestantes = registro.symptoms.length - sintomasVisiveis.length;

  return (
    <Card padding="md" className="w-full text-left" onClick={() => navigate(`/diario/${registro.id}`)}>
      {/* Card de lista do guia: 8 px entre os blocos e entre as etiquetas de
          sintoma (o espaço de um mesmo grupo), pelo `gap` (o reset global do
          `index.css` zera a margem do `p`). */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          {severidade !== null ? (
            <Tag tone={isAlertGrade(severidade) ? 'alert' : 'default'}>
              {getIntensityInfo(severidade).label}
            </Tag>
          ) : (
            <Tag tone="neutral">Anotação</Tag>
          )}
          <span className="text-caption font-medium text-muted-foreground">
            {registro.dateLabel}
          </span>
        </div>

        {registro.freeText && (
          <p className="line-clamp-2 overflow-hidden text-body-sm text-foreground">
            {registro.freeText}
          </p>
        )}

        {registro.symptoms.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sintomasVisiveis.map((sintoma) => (
              <Tag key={sintoma.symptomId} tone="neutral">
                {sintoma.label} · {sintoma.grade}
              </Tag>
            ))}
            {sintomasRestantes > 0 && <Tag tone="neutral">+{sintomasRestantes}</Tag>}
          </div>
        )}

        {registro.hasAlert && (
          <Tag tone="alert">
            <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" />
            Sinal de atenção
          </Tag>
        )}
      </div>
    </Card>
  );
}
