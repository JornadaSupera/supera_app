import { Link } from 'react-router-dom';
import { Bell, BookOpen, Calendar } from 'lucide-react';
import Avatar from '../../components/Avatar';
import { cx } from '../../utils/classNames';
import styles from './NotificationsPreview.module.css';

const ICON_BY_TIPO = {
  lembrete: { Icon: Bell, tone: 'primary' },
  orientacao: { Icon: BookOpen, tone: 'muted' },
  agenda: { Icon: Calendar, tone: 'primary' },
};

function getIconConfig(tipo) {
  return ICON_BY_TIPO[tipo] || ICON_BY_TIPO.lembrete;
}

export default function NotificationsPreview({ notificacoes = [] }) {
  if (!notificacoes.length) return null;

  return (
    <section>
      <div className={styles.header}>
        <h3 className={styles.title}>Notificações</h3>
        <Link to="/notificacoes" className={styles.link}>
          ver todas
        </Link>
      </div>

      <div className={styles.list}>
        {notificacoes.map((item) => {
          const showAvatar = item.tipo === 'chat' && item.autor;
          const { Icon, tone } = getIconConfig(item.tipo);

          return (
            <div
              key={item.id}
              className={cx(styles.item, !item.lida && styles.unread)}
            >
              {showAvatar ? (
                <Avatar name={item.autor.nome} src={item.autor.foto} size="md" />
              ) : (
                <span className={cx(styles.iconBubble, styles[tone])}>
                  <Icon size={16} strokeWidth={2} />
                </span>
              )}

              <div className={styles.text}>
                <p className={styles.itemTitle}>{item.titulo}</p>
                <p className={styles.itemDescription}>{item.descricao}</p>
              </div>

              <span className={styles.time}>{item.horaLabel}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
