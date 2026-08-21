import { useEffect, useState } from 'react';
import { Send, Clock } from 'lucide-react';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import { getAssuntoInfo } from '../../utils/chat';
import { iniciarConversa } from '../../services/mockApi';
import styles from './NewConversationModal.module.css';

export default function NewConversationModal({ open, assunto, onClose, onCriada }) {
  const assuntoInfo = assunto ? getAssuntoInfo(assunto) : null;

  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (open) setTexto('');
  }, [open, assunto]);

  async function handleEnviar() {
    if (!texto.trim() || enviando) return;

    setEnviando(true);
    try {
      const resultado = await iniciarConversa({ assunto, texto: texto.trim() });
      onCriada(resultado.id);
    } catch {
      // iniciarConversa não lança erro na prática
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={assuntoInfo ? `Nova conversa · ${assuntoInfo.label}` : 'Nova conversa'}
      footer={
        <Button
          variant="primary"
          fullWidth
          iconLeft={Send}
          loading={enviando}
          disabled={!texto.trim() || enviando}
          onClick={handleEnviar}
        >
          Enviar mensagem
        </Button>
      }
    >
      <p className={styles.descricao}>
        {assuntoInfo ? assuntoInfo.descricao : 'Escreva para a equipe multidisciplinar.'}
      </p>

      <div className={styles.onlineHighlight}>
        <Clock size={14} strokeWidth={2} aria-hidden="true" />
        <span>
          Equipe online: <strong>seg–sex, 08h–18h</strong>
        </span>
      </div>

      <textarea
        className={styles.textarea}
        value={texto}
        onChange={(event) => setTexto(event.target.value)}
        placeholder="Escreva sua primeira mensagem para a equipe..."
        aria-label="Mensagem"
      />
    </Modal>
  );
}
