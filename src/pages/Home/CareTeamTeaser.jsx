import { useNavigate } from 'react-router-dom';
import Card from '../../components/Card/Card';
import Avatar from '../../components/Avatar/Avatar';
import styles from './CareTeamTeaser.module.css';

const MAX_AVATARS = 5;

export default function CareTeamTeaser({ equipe = [], total = 0 }) {
  const navigate = useNavigate();
  const avatares = equipe.slice(0, MAX_AVATARS);

  return (
    <Card
      onClick={() => navigate('/chat')}
      padding="md"
      className={styles.card}
      style={{ cursor: 'pointer' }}
    >
      <p className={styles.title}>Sua equipe está com você</p>
      <p className={styles.subtitle}>
        Quando precisar de algo, a gente está a um chat de distância 💙
      </p>

      <div className={styles.stack}>
        {avatares.map((pessoa, index) => (
          <span
            key={`${pessoa.nome}-${index}`}
            className={styles.avatarWrapper}
            style={index > 0 ? { marginLeft: '-8px' } : undefined}
          >
            <Avatar src={pessoa.foto} name={pessoa.nome} size="sm" />
          </span>
        ))}
      </div>

      <p className={styles.count}>{total} profissionais cuidando de você</p>
    </Card>
  );
}
