import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import Badge from '../../components/Badge';
import styles from './ConversaListItem.module.css';

export default function ConversaListItem({ conversa }) {
  const { assuntoInfo, profissional } = conversa;
  const Icon = assuntoInfo ? assuntoInfo.icon : MessageCircle;

  return (
    <Link to={`/chat/${conversa.id}`} className={styles.item}>
      <span
        className={styles.iconBubble}
        style={
          assuntoInfo
            ? {
                color: assuntoInfo.colorVar,
                background: `color-mix(in srgb, ${assuntoInfo.colorVar} 15%, transparent)`,
              }
            : undefined
        }
      >
        <Icon size={18} strokeWidth={2} aria-hidden="true" />
      </span>

      <div className={styles.content}>
        <div className={styles.topRow}>
          <p className={styles.titulo}>{conversa.titulo}</p>
          <span className={styles.horaLabel}>{conversa.horaLabel}</span>
        </div>

        <p className={styles.ultimaMensagem}>{conversa.ultimaMensagem}</p>

        {(assuntoInfo || profissional) && (
          <div className={styles.meta}>
            {assuntoInfo && (
              <Badge tone="muted" variant="subtle" size="sm">
                {assuntoInfo.label}
              </Badge>
            )}
            {profissional && (
              <span className={styles.profissional}>
                · com {profissional.cargo} {profissional.nome}
              </span>
            )}
          </div>
        )}
      </div>

      {conversa.naoLidas > 0 && (
        <span className={styles.unreadBadge} aria-label={`${conversa.naoLidas} mensagens não lidas`}>
          {conversa.naoLidas}
        </span>
      )}
    </Link>
  );
}
