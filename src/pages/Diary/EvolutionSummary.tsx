import { describeEvolution, formatIntensity } from '../../utils/symptoms';
import type { SymptomEvolutionPoint } from '../../types';

interface EvolutionSummaryProps {
  points: SymptomEvolutionPoint[];
  symptomLabel: string;
  periodLabel: string;
}

/**
 * Leitura em texto do gráfico de evolução.
 *
 * A curva é só desenho: o leitor de tela não a alcança, e quem enxerga fica
 * sem os números que o traço arredonda. O parágrafo resume (dias com registro,
 * pior dia, último) e a tabela, escondida da vista, traz um valor por dia —
 * fora do `role="img"` do gráfico, porque o conteúdo de uma imagem não é
 * navegável.
 */
export default function EvolutionSummary({
  points,
  symptomLabel,
  periodLabel,
}: EvolutionSummaryProps) {
  const description = describeEvolution(points);

  if (!description) return null;

  return (
    <>
      <p className="mt-2 text-center text-[12px] text-foreground">{description}</p>

      <table className="sr-only">
        <caption>
          {symptomLabel}: intensidade por dia. {periodLabel}.
        </caption>
        <thead>
          <tr>
            <th scope="col">Dia</th>
            <th scope="col">Intensidade</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.dateLabel}>
              <td>{point.dateLabel}</td>
              <td>{formatIntensity(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
