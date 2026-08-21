import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Heart } from 'lucide-react';
import Loading from '../../components/Loading';
import Spinner from '../../components/Loading/Spinner';
import BottomTab from '../../components/BottomTab';
import GreetingHeader from './GreetingHeader';
import NextAppointmentCard from './NextAppointmentCard';
import DiarySummaryCard from './DiarySummaryCard';
import ShortcutsGrid from './ShortcutsGrid';
import NotificationsPreview from './NotificationsPreview';
import CareTeamTeaser from './CareTeamTeaser';
import {
  getPatient,
  getProximoCompromisso,
  getRegistroDeHoje,
  getNotificacoes,
  getResumoEquipe,
  getConversasNaoLidas,
} from '../../services/mockApi';
import styles from './Home.module.css';

const PULL_THRESHOLD = 64;
const PULL_MAX = 96;

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [erro, setErro] = useState(null);
  const [dados, setDados] = useState(null);
  const [pullDistance, setPullDistance] = useState(0);

  const scrollRef = useRef(null);
  const touchStartY = useRef(0);
  const pullingRef = useRef(false);
  const refreshingRef = useRef(false);

  const carregar = useCallback(async () => {
    try {
      const [patient, compromisso, diario, notificacoes, equipe, conversas] = await Promise.all([
        getPatient(),
        getProximoCompromisso(),
        getRegistroDeHoje(),
        getNotificacoes({ limit: 3 }),
        getResumoEquipe(),
        getConversasNaoLidas(),
      ]);

      setDados({ patient, compromisso, diario, notificacoes, equipe, conversas });
      setErro(null);
    } catch {
      setErro('Não foi possível atualizar agora. Puxe para baixo para tentar de novo.');
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    carregar().finally(() => {
      if (ativo) setLoading(false);
    });
    return () => {
      ativo = false;
    };
  }, [carregar]);

  const handleTouchStart = (event) => {
    if (refreshingRef.current) return;
    if (scrollRef.current && scrollRef.current.scrollTop <= 0) {
      touchStartY.current = event.touches[0].clientY;
      pullingRef.current = true;
    } else {
      pullingRef.current = false;
    }
  };

  const handleTouchMove = (event) => {
    if (!pullingRef.current || refreshingRef.current) return;
    const delta = event.touches[0].clientY - touchStartY.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.5, PULL_MAX));
    }
  };

  const handleTouchEnd = async () => {
    if (!pullingRef.current) return;
    pullingRef.current = false;

    if (pullDistance >= PULL_THRESHOLD) {
      refreshingRef.current = true;
      setRefreshing(true);
      setPullDistance(PULL_THRESHOLD);
      await carregar();
      refreshingRef.current = false;
      setRefreshing(false);
    }

    setPullDistance(0);
  };

  if (loading) return <Loading />;

  const { patient, compromisso, diario, notificacoes, equipe, conversas } = dados;

  return (
    <div className={styles.page}>
      <div
        ref={scrollRef}
        className={styles.scrollArea}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className={styles.pullIndicator}
          style={{ height: refreshing ? PULL_THRESHOLD : pullDistance }}
        >
          {(pullDistance > 0 || refreshing) && <Spinner size="sm" />}
        </div>

        <GreetingHeader nome={patient.nome} fotoUrl={patient.foto} />

        <div className={styles.sections}>
          {erro && <div className={styles.errorBanner}>{erro}</div>}
          <NextAppointmentCard appointment={compromisso} />
          <DiarySummaryCard registro={diario.registro} sequenciaDias={diario.sequenciaDias} />
          <ShortcutsGrid mensagensNaoLidas={conversas.total} />

          <Link to="/nps" className={styles.npsCard}>
            <span className={styles.npsIcon}>
              <Heart size={20} strokeWidth={2} aria-hidden="true" />
            </span>
            <div className={styles.npsText}>
              <p className={styles.npsTitle}>Como está sua experiência?</p>
              <p className={styles.npsSubtitle}>
                Leva 20 segundos — sua opinião ajuda a equipe.
              </p>
            </div>
            <ChevronRight
              size={16}
              strokeWidth={2}
              className={styles.npsChevron}
              aria-hidden="true"
            />
          </Link>

          <NotificationsPreview notificacoes={notificacoes} />
          <CareTeamTeaser equipe={equipe.equipe} total={equipe.total} />
        </div>
      </div>

      <BottomTab />
    </div>
  );
}
