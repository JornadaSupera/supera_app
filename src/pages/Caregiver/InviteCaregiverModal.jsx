import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import Input from '../../components/Input';
import Tag from '../../components/Tag';
import Button from '../../components/Button';
import { formatPhone } from '../../utils/masks';
import { convidarCuidador } from '../../services/mockApi';
import styles from './InviteCaregiverModal.module.css';

export default function InviteCaregiverModal({ open, onClose, onSucesso }) {
  const [nome, setNome] = useState('');
  const [parentesco, setParentesco] = useState('');
  const [meio, setMeio] = useState('sms');
  const [contato, setContato] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (open) {
      setNome('');
      setParentesco('');
      setMeio('sms');
      setContato('');
    }
  }, [open]);

  async function handleEnviar() {
    if (!nome.trim() || !contato.trim() || enviando) return;

    setEnviando(true);
    try {
      await convidarCuidador({
        nome: nome.trim(),
        parentesco: parentesco.trim() || 'Cuidador',
        meio,
        contato: contato.trim(),
      });
      onSucesso();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Convidar cuidador"
      footer={
        <Button
          variant="primary"
          fullWidth
          loading={enviando}
          disabled={!nome.trim() || !contato.trim() || enviando}
          onClick={handleEnviar}
        >
          Enviar convite
        </Button>
      }
    >
      <p className={styles.descricao}>
        Ele(a) vai receber um convite e criar um login próprio — nunca vai usar a sua senha.
      </p>

      <div className={styles.campos}>
        <Input
          label="Nome do cuidador"
          id="cuidador-nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Camila Mendes"
          required
        />

        <Input
          label="Parentesco"
          id="cuidador-parentesco"
          value={parentesco}
          onChange={(e) => setParentesco(e.target.value)}
          placeholder="Ex: Esposa, Filho, Irmã..."
        />

        <div className={styles.meioField}>
          <span className={styles.meioLabel}>Como enviar o convite</span>
          <div className={styles.meioOpcoes}>
            <Tag
              className={styles.meioChip}
              selected={meio === 'sms'}
              onClick={() => {
                setMeio('sms');
                setContato('');
              }}
            >
              SMS
            </Tag>
            <Tag
              className={styles.meioChip}
              selected={meio === 'email'}
              onClick={() => {
                setMeio('email');
                setContato('');
              }}
            >
              E-mail
            </Tag>
          </div>
        </div>

        {meio === 'sms' ? (
          <Input
            label="Celular do cuidador"
            id="cuidador-contato"
            type="tel"
            value={contato}
            onChange={(e) => setContato(formatPhone(e.target.value))}
            placeholder="(00) 00000-0000"
            required
          />
        ) : (
          <Input
            label="E-mail do cuidador"
            id="cuidador-contato"
            type="email"
            value={contato}
            onChange={(e) => setContato(e.target.value)}
            placeholder="nome@email.com"
            required
          />
        )}
      </div>
    </Modal>
  );
}
