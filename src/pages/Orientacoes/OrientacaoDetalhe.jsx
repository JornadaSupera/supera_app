import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Star, CirclePlay, Image, FileText, User, Clock, Eye } from 'lucide-react';
import Header from '../../components/Header';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import {
  getOrientacaoPorId,
  marcarOrientacaoComoLida,
  alternarFavoritoOrientacao,
} from '../../services/mockApi';
import { useToast } from '../../contexts/ToastContext';
import styles from './OrientacaoDetalhe.module.css';

export default function OrientacaoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [orientacao, setOrientacao] = useState(null);
  const [favorito, setFavorito] = useState(false);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(false);

    getOrientacaoPorId(id)
      .then((data) => {
        if (!ativo) return;
        setOrientacao(data);
        setFavorito(data.favorito);
        marcarOrientacaoComoLida(id);
      })
      .catch(() => {
        if (!ativo) return;
        setErro(true);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [id]);

  if (carregando) {
    return <Loading />;
  }

  if (erro || !orientacao) {
    return (
      <div className={styles.page}>
        <Header
          variant="step"
          sticky
          bordered
          blurred
          onBack={() => navigate('/orientacoes')}
          meta="Orientação"
        />
        <EmptyState
          title="Orientação não encontrada"
          description="Esse conteúdo pode ter sido removido ou movido de categoria."
          actionLabel="Voltar para Orientações"
          onAction={() => navigate('/orientacoes')}
        />
      </div>
    );
  }

  async function handleToggleFavorito() {
    const resultado = await alternarFavoritoOrientacao(id);
    setFavorito(resultado.favorito);
  }

  return (
    <div className={styles.page}>
      <Header
        variant="step"
        sticky
        bordered
        blurred
        onBack={() => navigate('/orientacoes')}
        meta="Orientação"
        actions={
          <button
            type="button"
            className={styles.favoriteButton}
            onClick={handleToggleFavorito}
            aria-label={favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            aria-pressed={favorito}
          >
            <Star
              size={18}
              strokeWidth={2}
              fill={favorito ? 'var(--color-brand-gold)' : 'none'}
              stroke={favorito ? 'var(--color-brand-gold)' : 'currentColor'}
              aria-hidden="true"
            />
          </button>
        }
      />

      <main className={styles.content}>
        {orientacao.tipo === 'video' && (
          <div className={styles.videoPreview}>
            <div className={styles.videoPlayButton}>
              <CirclePlay size={40} strokeWidth={1.5} color="var(--color-primary)" aria-hidden="true" />
            </div>
            {orientacao.duracaoLabel && (
              <span className={styles.videoDuration}>{orientacao.duracaoLabel}</span>
            )}
          </div>
        )}

        {orientacao.tipo === 'infografico' && (
          <div className={styles.infograficoPreview}>
            <Image size={48} strokeWidth={1.5} className={styles.infograficoIcon} aria-hidden="true" />
            <span className={styles.infograficoLabel}>Infográfico em alta resolução</span>
          </div>
        )}

        {orientacao.tipo === 'pdf' && (
          <div className={styles.pdfCard}>
            <span className={styles.pdfIconWrapper}>
              <FileText size={20} strokeWidth={2} aria-hidden="true" />
            </span>
            <div className={styles.pdfInfo}>
              <p className={styles.pdfName}>{orientacao.titulo}.pdf</p>
              <p className={styles.pdfMeta}>
                {orientacao.tipoLabel} · {orientacao.tempoLeituraMin} min de leitura
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                showToast('O download não está disponível nesta demonstração.', {
                  variant: 'info',
                })
              }
            >
              Baixar
            </Button>
          </div>
        )}

        <div className={styles.badgeRow}>
          <Badge tone="muted" variant="subtle" size="sm">
            {orientacao.categoria}
          </Badge>
          <Badge tone="secondary" size="sm">
            {orientacao.subcategoria}
          </Badge>
        </div>

        <h1 className={styles.title}>{orientacao.titulo}</h1>
        <p className={styles.resumo}>{orientacao.resumo}</p>

        <div className={styles.metaRow}>
          <span className={styles.metaItem}>
            <User size={13} strokeWidth={2} aria-hidden="true" />
            {orientacao.autor}
          </span>
          <span className={styles.metaSeparator}>·</span>
          <span className={styles.metaItem}>
            <Clock size={13} strokeWidth={2} aria-hidden="true" />
            {orientacao.tempoLeituraMin} min
          </span>
          <span className={styles.metaSeparator}>·</span>
          <span className={styles.metaItem}>
            <Eye size={13} strokeWidth={2} aria-hidden="true" />
            {orientacao.acessos.toLocaleString('pt-BR')} acessos
          </span>
        </div>

        <p className={styles.publicadoEm}>{orientacao.publicadoLabel}</p>

        <div className={styles.body}>
          {orientacao.conteudo.map((paragrafo, index) => (
            <p key={index}>{paragrafo}</p>
          ))}
        </div>

        {orientacao.tags?.length > 0 && (
          <div className={styles.tagsRow}>
            {orientacao.tags.map((tag) => (
              <span key={tag} className={styles.tag}>
                #{tag}
              </span>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
