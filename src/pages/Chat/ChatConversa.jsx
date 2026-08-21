import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ChevronLeft, Paperclip, Send, Image as ImageIcon } from 'lucide-react';
import Avatar from '../../components/Avatar';
import Badge from '../../components/Badge';
import EmptyState from '../../components/EmptyState';
import Loading from '../../components/Loading';
import { useToast } from '../../contexts/ToastContext';
import { getConversaPorId, marcarConversaComoLida, enviarMensagem } from '../../services/mockApi';
import styles from './ChatConversa.module.css';

const CARGO_POR_EXTENSO = {
  'Onco.': 'Oncologia',
  'Enf.': 'Enfermagem',
  'Farm.': 'Farmácia',
  'Psic.': 'Psicologia',
  'Nutri.': 'Nutrição',
  'Dr.': 'Medicina',
  'Fisio.': 'Fisioterapia',
};

function formatGrupoDia(data) {
  const inicioDoDia = (d) => {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  };
  const diffDias = Math.round((inicioDoDia(new Date()) - inicioDoDia(data)) / 86400000);
  if (diffDias <= 0) return 'Hoje';
  if (diffDias === 1) return 'Ontem';
  return `Há ${diffDias} dias`;
}

function agruparMensagensPorDia(mensagens) {
  const grupos = [];
  let grupoAtual = null;

  mensagens.forEach((mensagem) => {
    const chaveDia = new Date(mensagem.data).toDateString();
    if (!grupoAtual || grupoAtual.chaveDia !== chaveDia) {
      grupoAtual = { chaveDia, label: formatGrupoDia(mensagem.data), mensagens: [] };
      grupos.push(grupoAtual);
    }
    grupoAtual.mensagens.push(mensagem);
  });

  return grupos;
}

export default function ChatConversa() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [conversa, setConversa] = useState(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const fimDasMensagensRef = useRef(null);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(false);

    getConversaPorId(id)
      .then((data) => {
        if (!ativo) return;
        setConversa(data);
        marcarConversaComoLida(id);
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

  useEffect(() => {
    fimDasMensagensRef.current?.scrollIntoView({ block: 'end' });
  }, [conversa?.mensagens]);

  async function handleEnviar() {
    if (!texto.trim() || enviando) return;

    const textoParaEnviar = texto.trim();
    setEnviando(true);
    setTexto('');

    try {
      const resultado = await enviarMensagem(id, textoParaEnviar);
      setConversa((atual) => ({
        ...atual,
        mensagens: [...atual.mensagens, resultado.mensagem],
      }));
    } finally {
      setEnviando(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleEnviar();
    }
  }

  function handleAnexar() {
    showToast('O envio de arquivos não está disponível nesta demonstração.', {
      variant: 'info',
    });
  }

  if (carregando) {
    return <Loading />;
  }

  if (erro || !conversa) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate('/chat')}
            aria-label="Voltar"
          >
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        </header>
        <EmptyState
          title="Conversa não encontrada"
          description="Essa conversa pode ter sido removida."
          actionLabel="Voltar para o Chat"
          onAction={() => navigate('/chat')}
        />
      </div>
    );
  }

  const nomeCabecalho = conversa.profissional
    ? `${conversa.profissional.cargo} ${conversa.profissional.nome}`
    : 'Equipe Supera';

  const subtituloCabecalho = conversa.profissional
    ? `${conversa.assuntoInfo ? `${conversa.assuntoInfo.label} · ` : ''}${conversa.titulo}`
    : `Assunto: ${conversa.assuntoInfo ? conversa.assuntoInfo.label : conversa.titulo}`;

  const grupos = agruparMensagensPorDia(conversa.mensagens);
  const podeEnviar = texto.trim().length > 0 && !enviando;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <Link to="/chat" className={styles.backButton} aria-label="Voltar">
            <ChevronLeft size={18} strokeWidth={2} />
          </Link>
          <Avatar
            src={conversa.profissional?.foto}
            name={conversa.profissional ? conversa.profissional.nome : 'Equipe Supera'}
            size="md"
          />
          <div className={styles.headerInfo}>
            <p className={styles.headerNome}>{nomeCabecalho}</p>
            <p className={styles.headerSubtitulo}>{subtituloCabecalho}</p>
          </div>
          {conversa.assuntoInfo && (
            <Badge tone="secondary" size="sm" className={styles.headerBadge}>
              {conversa.assuntoInfo.label}
            </Badge>
          )}
        </div>
      </header>

      <main className={styles.mensagens}>
        {grupos.map((grupo) => (
          <div key={grupo.chaveDia} className={styles.grupoDia}>
            <div className={styles.separadorDia}>
              <span className={styles.separadorDiaChip}>{grupo.label}</span>
            </div>

            {grupo.mensagens.map((mensagem) => {
              if (mensagem.tipo === 'sistema') {
                return (
                  <div key={mensagem.id} className={styles.chipSistemaWrapper}>
                    <span className={styles.chipSistema}>{mensagem.texto}</span>
                  </div>
                );
              }

              if (mensagem.autor === 'paciente') {
                const statusLabel = mensagem.statusEnvio
                  ? `${mensagem.horaLabel} · ${mensagem.statusEnvio === 'enviada' ? 'Enviada' : 'Lida'}`
                  : mensagem.horaLabel;

                return (
                  <div key={mensagem.id} className={styles.mensagemPaciente}>
                    {mensagem.tipo === 'imagem' ? (
                      <div className={styles.imagemBolha}>
                        <ImageIcon size={28} strokeWidth={1.5} className={styles.imagemIcone} />
                        {mensagem.legenda && (
                          <span className={styles.imagemLegenda}>{mensagem.legenda}</span>
                        )}
                      </div>
                    ) : (
                      <div className={styles.bolhaPaciente}>{mensagem.texto}</div>
                    )}
                    <span className={styles.horaPaciente}>{statusLabel}</span>
                  </div>
                );
              }

              const ehAutomatica = mensagem.autor === 'automatica';
              const nomeAutor = ehAutomatica
                ? 'Equipe Supera'
                : `${conversa.profissional?.cargo ?? ''} ${conversa.profissional?.nome ?? ''}`.trim();
              const cargoExtenso = ehAutomatica
                ? 'automática'
                : CARGO_POR_EXTENSO[conversa.profissional?.cargo] || conversa.profissional?.cargo;

              return (
                <div key={mensagem.id} className={styles.mensagemProfissional}>
                  <div className={styles.autorLinha}>
                    <Avatar
                      size="sm"
                      src={mensagem.autor === 'profissional' ? conversa.profissional?.foto : null}
                      name={mensagem.autor === 'profissional' ? conversa.profissional?.nome : 'Equipe Supera'}
                    />
                    <span>
                      {nomeAutor} · {cargoExtenso}
                    </span>
                  </div>
                  <div className={styles.bolhaProfissional}>{mensagem.texto}</div>
                  <span className={styles.horaProfissional}>{mensagem.horaLabel}</span>
                </div>
              );
            })}
          </div>
        ))}

        <div className={styles.avisoResposta}>
          Tempo médio de resposta da equipe: ~45 min em horário comercial.
        </div>

        <div ref={fimDasMensagensRef} />
      </main>

      <footer className={styles.barraEnvio}>
        <button
          type="button"
          className={styles.botaoAnexar}
          onClick={handleAnexar}
          aria-label="Anexar arquivo"
        >
          <Paperclip size={17} strokeWidth={2} />
        </button>

        <input
          type="text"
          className={styles.inputMensagem}
          value={texto}
          onChange={(event) => setTexto(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite sua mensagem..."
          aria-label="Mensagem"
        />

        <button
          type="button"
          className={styles.botaoEnviar}
          onClick={handleEnviar}
          disabled={!podeEnviar}
          aria-label="Enviar mensagem"
        >
          <Send size={16} strokeWidth={2} />
        </button>
      </footer>
    </div>
  );
}
