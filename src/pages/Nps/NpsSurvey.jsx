import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, CircleCheck } from 'lucide-react';
import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import BottomTab from '../../components/BottomTab';
import { enviarRespostaNps } from '../../services/mockApi';
import { cx } from '../../utils/classNames';
import styles from './NpsSurvey.module.css';

const NOTAS = Array.from({ length: 11 }, (_, indice) => indice);

function getClasseCategoriaNota(nota, styles) {
  if (nota <= 6) return styles.notaButtonDetrator;
  if (nota <= 8) return styles.notaButtonPassivo;
  return styles.notaButtonPromotor;
}

function NpsHeader({ onBack }) {
  return (
    <header className={styles.header}>
      <button
        type="button"
        className={styles.backButton}
        onClick={onBack}
        aria-label="Voltar"
      >
        <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
      </button>
      <div className={styles.titleGroup}>
        <p className={styles.eyebrow}>PESQUISA DE SATISFAÇÃO</p>
        <h1 className={styles.title}>Sua experiência</h1>
      </div>
    </header>
  );
}

export default function NpsSurvey() {
  const navigate = useNavigate();

  const [notaSelecionada, setNotaSelecionada] = useState(null);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function handleEnviar() {
    if (notaSelecionada === null || enviando) return;

    setEnviando(true);
    try {
      await enviarRespostaNps({ nota: notaSelecionada, comentario: comentario.trim() });
      setEnviado(true);
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div className={styles.page}>
        <NpsHeader onBack={() => navigate('/perfil')} />

        <div className={styles.thanksContent}>
          <EmptyState
            icon={CircleCheck}
            title="Obrigado! 💙"
            description="Sua resposta ajuda a equipe a cuidar cada vez melhor de você e dos próximos pacientes."
            actionLabel="Voltar ao início"
            onAction={() => navigate('/home')}
          />
        </div>

        <BottomTab />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <NpsHeader onBack={() => navigate('/perfil')} />

      <main className={styles.content}>
        <h2 className={styles.pergunta}>
          De 0 a 10, o quanto você recomendaria o Centro a quem precisa?
        </h2>
        <p className={styles.disparo}>Disparada automaticamente em marcos do tratamento.</p>

        <div className={styles.notasGrid}>
          {NOTAS.map((nota) => (
            <button
              key={nota}
              type="button"
              aria-pressed={notaSelecionada === nota}
              className={cx(
                styles.notaButton,
                notaSelecionada === nota && styles.notaButtonSelected,
                notaSelecionada === nota && getClasseCategoriaNota(nota, styles)
              )}
              onClick={() => setNotaSelecionada(nota)}
            >
              {nota}
            </button>
          ))}
        </div>

        <div className={styles.notasLegenda}>
          <span>Não recomendaria</span>
          <span>Recomendaria muito</span>
        </div>

        <div className={styles.comentarioBlock}>
          <label className={styles.comentarioLabel} htmlFor="nps-comentario">
            Quer contar o porquê? (opcional)
          </label>
          <textarea
            id="nps-comentario"
            className={styles.comentarioTextarea}
            value={comentario}
            onChange={(event) => setComentario(event.target.value)}
            placeholder="O que poderia ser melhor? O que você mais gostou?"
          />
        </div>
      </main>

      <div className={styles.footer}>
        <Button
          variant="primary"
          fullWidth
          disabled={notaSelecionada === null || enviando}
          loading={enviando}
          onClick={handleEnviar}
        >
          Enviar resposta
        </Button>
      </div>

      <BottomTab />
    </div>
  );
}
