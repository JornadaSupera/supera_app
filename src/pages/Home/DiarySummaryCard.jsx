import { useNavigate } from 'react-router-dom';
import { ChevronRight, Heart } from 'lucide-react';
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

  const { label, icon: MoodIcon, colorVar } = getMoodInfo(registro.grau);
  const primeiroSintoma = registro.sintomas && registro.sintomas[0];

  return (
    <Card padding="md" onClick={() => navigate(`/diario/${registro.id}`)} className={styles.card}>
      <div className={styles.row}>
        <span
          className={styles.moodIcon}
          style={{
            backgroundColor: `color-mix(in srgb, ${colorVar} 15%, transparent)`,
            boxShadow: `0 0 0 2px color-mix(in srgb, ${colorVar} 40%, transparent)`,
            color: colorVar,
          }}
          aria-label={`Grau ${registro.grau} — ${label}`}
        >
          <MoodIcon size={24} strokeWidth={2} aria-hidden="true" />
        </span>

        <div className={styles.content}>
          <h3 className={styles.title}>
            Você registrou hoje: <span style={{ color: colorVar }}>{label}</span>
          </h3>

          {registro.texto && <p className={styles.text}>{registro.texto}</p>}

          {primeiroSintoma && (
            <div className={styles.badgeRow}>
              <Badge tone="secondary" size="sm">
                {primeiroSintoma.nome} · {primeiroSintoma.intensidade}
              </Badge>
            </div>
          )}

          <div className={styles.link}>
            Ver detalhes
            <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
          </div>
        </div>
      </div>

      {sequenciaDias > 1 && (
        <div className={styles.streak}>
          <Heart size={14} strokeWidth={2.5} fill="currentColor" aria-hidden="true" />
          <p>
            <strong>{sequenciaDias} dias seguidos</strong> registrando. Sua equipe agradece por
            compartilhar.
          </p>
        </div>
      )}
    </Card>
  );
}
