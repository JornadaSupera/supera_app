import { Link, useNavigate } from 'react-router-dom';
import Card from '../../components/Card/Card';
import Badge from '../../components/Badge/Badge';
import Button from '../../components/Button/Button';
import { getMoodInfo } from '../../utils/mood';
import styles from './DiarySummaryCard.module.css';

export default function DiarySummaryCard({ registro, sequenciaDias = 0 }) {
  const navigate = useNavigate();

  if (!registro) {
    return (
      <Card padding="md">
        <h3 className={styles.emptyTitle}>Como você está hoje?</h3>
        <p className={styles.subtitle}>
          Registrar como você está ajuda sua equipe a te acompanhar melhor.
        </p>
        <Button
          fullWidth
          size="sm"
          className={styles.ctaButton}
          onClick={() => navigate('/diario')}
        >
          Fazer registro de hoje
        </Button>
      </Card>
    );
  }

  const { label } = getMoodInfo(registro.grau);
  const primeiroSintoma = registro.sintomas && registro.sintomas[0];

  return (
    <Card padding="md">
      <Badge tone={`mood-${registro.grau}`} withDot>
        Grau {registro.grau} — {label}
      </Badge>

      <h3 className={styles.title}>Você registrou hoje: {label}</h3>

      {registro.texto && <p className={styles.text}>{registro.texto}</p>}

      {primeiroSintoma && (
        <p className={styles.symptom}>
          {primeiroSintoma.nome} · {primeiroSintoma.intensidade}
        </p>
      )}

      <div className={styles.footer}>
        {sequenciaDias > 1 && (
          <span className={styles.streak}>{sequenciaDias} dias seguidos</span>
        )}
        <Link to="/diario" className={styles.link}>
          Ver detalhes
        </Link>
      </div>
    </Card>
  );
}
