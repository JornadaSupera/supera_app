import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import BottomTab from '../../components/BottomTab';
import ConversaListItem from './ConversaListItem';
import NovaConversaModal from './NovaConversaModal';
import { getConversas } from '../../services/mockApi';
import { ASSUNTOS } from '../../utils/chat';
import styles from './ChatLista.module.css';

const CHAVES_ASSUNTOS = ['medicacao', 'agendamento', 'sintomas', 'outros'];

export default function ChatLista() {
  const navigate = useNavigate();

  const [carregando, setCarregando] = useState(true);
  const [conversas, setConversas] = useState([]);

  const [modalAberto, setModalAberto] = useState(false);
  const [assuntoSelecionado, setAssuntoSelecionado] = useState(null);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      setCarregando(true);
      const data = await getConversas();
      if (!ativo) return;
      setConversas(data);
      setCarregando(false);
    }

    carregar();

    return () => {
      ativo = false;
    };
  }, []);

  function abrirModalNovaConversa(assunto) {
    setAssuntoSelecionado(assunto);
    setModalAberto(true);
  }

  if (carregando) {
    return <Loading />;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>CHAT COM A EQUIPE</p>
        <h1 className={styles.title}>Como podemos ajudar?</h1>
        <p className={styles.onlineRow}>
          <Clock size={13} strokeWidth={2} aria-hidden="true" />
          Equipe online: <strong>seg–sex, 08h–18h</strong>
        </p>
      </header>

      <main className={styles.content}>
        <section>
          <h2 className={styles.sectionHeading}>INICIAR NOVA CONVERSA</h2>
          <div className={styles.assuntoGrid}>
            {CHAVES_ASSUNTOS.map((chave) => {
              const assunto = ASSUNTOS[chave];
              const Icon = assunto.icon;

              return (
                <button
                  type="button"
                  key={chave}
                  className={styles.assuntoCard}
                  onClick={() => abrirModalNovaConversa(chave)}
                >
                  <span
                    className={styles.assuntoIconBox}
                    style={{
                      background: `color-mix(in srgb, ${assunto.colorVar} 15%, transparent)`,
                      color: assunto.colorVar,
                    }}
                  >
                    <Icon size={16} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className={styles.assuntoLabel}>{assunto.label}</span>
                  <span className={styles.assuntoDescricao}>{assunto.descricao}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className={styles.sectionHeading}>CONVERSAS</h2>
          {conversas.length === 0 ? (
            <EmptyState
              title="Nenhuma conversa ainda"
              description="Inicie uma conversa com a equipe quando precisar."
            />
          ) : (
            <div className={styles.conversasList}>
              {conversas.map((conversa) => (
                <ConversaListItem conversa={conversa} key={conversa.id} />
              ))}
            </div>
          )}
        </section>

        <p className={styles.aviso}>
          Em caso de urgência fora do horário, procure o pronto atendimento ou emergência mais
          próximo.
        </p>
      </main>

      <BottomTab />

      <NovaConversaModal
        open={modalAberto}
        assunto={assuntoSelecionado}
        onClose={() => setModalAberto(false)}
        onCriada={(novoId) => navigate(`/chat/${novoId}`)}
      />
    </div>
  );
}
