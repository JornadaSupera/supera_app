import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Card from '../../components/Card/Card';
import Avatar from '../../components/Avatar/Avatar';
import styles from './CareTeamTeaser.module.css';

export default function CareTeamTeaser({ equipe = [], total = 0 }) {
  const navigate = useNavigate();

  return (
    <Card
      onClick={() => navigate('/chat')}
      padding="none"
      className={styles.card}
      style={{ padding: 'var(--space-4)' }}
    >
      <div className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.title}>Sua equipe está com você</p>
          <p className={styles.subtitle}>
            Quando precisar de algo, a gente está a um chat de distância 💙
          </p>
        </div>
        <ChevronRight size={16} strokeWidth={2} className={styles.chevron} aria-hidden="true" />
      </div>

      <div className={styles.stack}>
        {equipe.map((pessoa, index) => (
          <span
            key={`${pessoa.nome}-${index}`}
            className={styles.avatarWrapper}
            style={{
              marginLeft: index > 0 ? '-6px' : 0,
              zIndex: equipe.length - index,
            }}
          >
            <Avatar src={pessoa.foto} name={pessoa.nome} size="md" ring />
          </span>
        ))}
        <span className={styles.count}>{total} profissionais cuidando de você</span>
      </div>
    </Card>
  );
}
