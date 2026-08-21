import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, ChevronRight, Star } from 'lucide-react';
import Badge from '../../components/Badge';
import { alternarFavoritoOrientacao } from '../../services/mockApi';
import styles from './OrientacaoCard.module.css';

export default function OrientacaoCard({ orientacao, onFavoritoChange }) {
  const [favorito, setFavorito] = useState(orientacao.favorito);
  const Icon = orientacao.icon;

  async function handleFavoritoClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const novoValor = !favorito;
    setFavorito(novoValor);

    const resultado = await alternarFavoritoOrientacao(orientacao.id);
    setFavorito(resultado.favorito);
    onFavoritoChange?.(orientacao.id, resultado.favorito);
  }

  return (
    <Link to={`/orientacoes/${orientacao.id}`} className={styles.card}>
      <span
        className={styles.iconBubble}
        style={{
          color: orientacao.colorVar,
          background: `color-mix(in srgb, ${orientacao.colorVar} 15%, transparent)`,
        }}
      >
        <Icon size={18} strokeWidth={2} aria-hidden="true" />
      </span>

      <div className={styles.content}>
        <div className={styles.topRow}>
          <p className={orientacao.lida ? styles.tituloLida : styles.titulo}>
            {!orientacao.lida && <span className={styles.unreadDot} aria-hidden="true" />}
            {orientacao.titulo}
          </p>

          <button
            type="button"
            className={styles.favoritoButton}
            onClick={handleFavoritoClick}
            aria-label={favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            aria-pressed={favorito}
          >
            <Star
              size={16}
              strokeWidth={2}
              fill={favorito ? 'var(--color-brand-gold)' : 'none'}
              stroke={favorito ? 'var(--color-brand-gold)' : 'var(--color-muted-foreground)'}
            />
          </button>
        </div>

        <p className={styles.resumo}>{orientacao.resumo}</p>

        <div className={styles.metaRow}>
          <Badge tone="muted" variant="subtle" size="sm">
            {orientacao.tipoLabel}
          </Badge>
          <span className={styles.tempoLeitura}>
            <Clock size={12} strokeWidth={2} aria-hidden="true" />
            {orientacao.tempoLeituraMin} min
          </span>
        </div>
      </div>

      <ChevronRight size={16} strokeWidth={2} className={styles.chevron} aria-hidden="true" />
    </Link>
  );
}
