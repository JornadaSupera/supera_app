import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import Tag from '../../components/Tag';
import EmptyState from '../../components/EmptyState';
import Loading from '../../components/Loading';
import BottomTab from '../../components/BottomTab';
import NotificationItem from './NotificationItem';
import { getTodasNotificacoes, marcarTodasNotificacoesComoLidas } from '../../services/mockApi';
import { TIPOS_NOTIFICACAO } from '../../utils/notifications';
import styles from './NotificationsCenter.module.css';

const CHAVES_TIPOS = ['lembrete', 'chat', 'orientacao', 'agenda'];

export default function NotificationsCenter() {
  const navigate = useNavigate();

  const [carregando, setCarregando] = useState(true);
  const [notificacoes, setNotificacoes] = useState([]);
  const [filtroTipo, setFiltroTipo] = useState(null);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      setCarregando(true);
      const data = await getTodasNotificacoes();
      if (!ativo) return;
      setNotificacoes(data);
      setCarregando(false);
    }

    carregar();

    return () => {
      ativo = false;
    };
  }, []);

  if (carregando) {
    return <Loading />;
  }

  const naoLidasCount = notificacoes.filter((notificacao) => !notificacao.lida).length;
  const listaFiltrada = notificacoes.filter(
    (notificacao) => !filtroTipo || notificacao.tipo === filtroTipo
  );
  const naoLidas = listaFiltrada.filter((notificacao) => !notificacao.lida);
  const anteriores = listaFiltrada.filter((notificacao) => notificacao.lida);

  function handleMarcarComoLida(id) {
    setNotificacoes((atual) =>
      atual.map((notificacao) => (notificacao.id === id ? { ...notificacao, lida: true } : notificacao))
    );
  }

  function handleMarcarTodas() {
    marcarTodasNotificacoesComoLidas();
    setNotificacoes((atual) => atual.map((notificacao) => ({ ...notificacao, lida: true })));
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.topRow}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate('/home')}
            aria-label="Voltar"
          >
            <ChevronLeft size={16} strokeWidth={2} />
          </button>

          <div className={styles.headerInfo}>
            <p className={styles.eyebrow}>CENTRO DE NOTIFICAÇÕES</p>
            <h1 className={styles.title}>Tudo da semana</h1>
          </div>

          {naoLidasCount > 0 && (
            <span className={styles.badge} aria-label={`${naoLidasCount} não lidas`}>
              {naoLidasCount}
            </span>
          )}
        </div>

        {naoLidasCount > 0 && (
          <div className={styles.actionsRow}>
            <button type="button" className={styles.marcarTodasButton} onClick={handleMarcarTodas}>
              Marcar todas como lidas
            </button>
          </div>
        )}

        <div className={styles.filterRow}>
          <Tag selected={filtroTipo === null} onClick={() => setFiltroTipo(null)}>
            Todas
          </Tag>
          {CHAVES_TIPOS.map((chave) => (
            <Tag key={chave} selected={filtroTipo === chave} onClick={() => setFiltroTipo(chave)}>
              {TIPOS_NOTIFICACAO[chave].label}
            </Tag>
          ))}
        </div>
      </header>

      <main className={styles.content}>
        {listaFiltrada.length === 0 ? (
          <EmptyState
            title="Nenhuma notificação encontrada"
            description="Tente ajustar o filtro selecionado."
          />
        ) : (
          <>
            {naoLidas.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionHeading}>NÃO LIDAS</h2>
                <div className={styles.list}>
                  {naoLidas.map((item) => (
                    <NotificationItem notificacao={item} key={item.id} onLida={handleMarcarComoLida} />
                  ))}
                </div>
              </section>
            )}

            {anteriores.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionHeading}>ANTERIORES</h2>
                <div className={styles.list}>
                  {anteriores.map((item) => (
                    <NotificationItem notificacao={item} key={item.id} onLida={handleMarcarComoLida} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <BottomTab />
    </div>
  );
}
