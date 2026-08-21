import { Link } from 'react-router-dom';
import { marcarNotificacaoComoLida } from '../../services/mockApi';
import { cx } from '../../utils/classNames';
import styles from './NotificacaoItem.module.css';

export default function NotificacaoItem({ notificacao, onLida }) {
  const { tipoInfo } = notificacao;
  const Icon = tipoInfo.icon;

  function handleClick() {
    if (!notificacao.lida) {
      marcarNotificacaoComoLida(notificacao.id);
      onLida(notificacao.id);
    }
  }

  const conteudo = (
    <>
      <span
        className={styles.iconBox}
        style={{
          background: `color-mix(in srgb, ${tipoInfo.colorVar} 15%, transparent)`,
          color: tipoInfo.colorVar,
        }}
      >
        <Icon size={16} strokeWidth={2} aria-hidden="true" />
      </span>

      <span className={styles.text}>
        <span className={cx(styles.titulo, !notificacao.lida && styles.tituloNaoLida)}>
          {notificacao.titulo}
        </span>
        <span className={styles.descricao}>{notificacao.descricao}</span>
      </span>

      <span className={styles.hora}>{notificacao.horaLabel}</span>
    </>
  );

  const className = cx(styles.item, !notificacao.lida && styles.naoLida);

  if (tipoInfo.destino) {
    return (
      <Link to={tipoInfo.destino} onClick={handleClick} className={className}>
        {conteudo}
      </Link>
    );
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      {conteudo}
    </button>
  );
}
