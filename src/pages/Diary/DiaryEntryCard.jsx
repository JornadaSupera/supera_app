import { useNavigate } from 'react-router';
import { TriangleAlert } from 'lucide-react';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import { getMoodInfo } from '../../utils/mood';
import styles from './DiaryEntryCard.module.css';

const MAX_SINTOMAS_VISIVEIS = 4;

export default function DiaryEntryCard({ registro }) {
  const navigate = useNavigate();
  const mood = getMoodInfo(registro.grau);

  const sintomasVisiveis = registro.sintomas.slice(0, MAX_SINTOMAS_VISIVEIS);
  const sintomasRestantes = registro.sintomas.length - sintomasVisiveis.length;

  return (
    <Card
      padding="md"
      className={styles.card}
      onClick={() => navigate(`/diario/${registro.id}`)}
    >
      <div className={styles.topRow}>
        <Badge tone={`mood-${registro.grau}`} withDot>
          {mood.label}
        </Badge>
        <span className={styles.dataLabel}>{registro.dataLabel}</span>
      </div>

      {registro.texto && <p className={styles.texto}>{registro.texto}</p>}

      {registro.sintomas.length > 0 && (
        <div className={styles.chips}>
          {sintomasVisiveis.map((sintoma) => (
            <span key={sintoma.nome} className={styles.chip}>
              {sintoma.nome} · {sintoma.intensidade}
            </span>
          ))}
          {sintomasRestantes > 0 && (
            <span className={styles.chip}>+{sintomasRestantes}</span>
          )}
        </div>
      )}

      {registro.temAlerta && (
        <div className={styles.alertTag}>
          <TriangleAlert size={12} strokeWidth={2.5} aria-hidden="true" />
          Sinal de atenção
        </div>
      )}
    </Card>
  );
}
