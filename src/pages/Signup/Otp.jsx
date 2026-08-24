import { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ChevronRight, MessageSquare } from 'lucide-react';
import Button from '../../components/Button';
import IconHeading from '../../components/IconHeading';
import Header from '../../components/Header';
import { useToast } from '../../contexts/ToastContext';
import { useSignup } from '../../contexts/SignupContext';
import { confirmarCodigoSms, enviarCodigoSms } from '../../services/mockApi';
import { cx } from '../../utils/classNames';
import styles from './Otp.module.css';

const QUANTIDADE_DIGITOS = 6;

// Insere um espaço depois do 9º dígito (nono dígito do celular) só para
// exibição neste lembrete, replicando a formatação do protótipo
// ("(48) 9 8812-4477"). Não mexe em utils/masks.js (compartilhado) — o
// valor mascarado salvo no contexto continua "(48) 98812-4477" em todo o
// resto do fluxo.
function formatarCelularParaExibicao(celular) {
  return celular.replace(/^(\(\d{2}\) )(\d)(\d{4}-\d{4})$/, '$1$2 $3');
}

export default function Otp() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { celular, setOtpVerified } = useSignup();

  const [digits, setDigits] = useState(() => Array(QUANTIDADE_DIGITOS).fill(''));
  const [hasError, setHasError] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [reenviando, setReenviando] = useState(false);

  const inputRefs = useRef([]);

  if (!celular) {
    return <Navigate to="/cadastro" replace />;
  }

  const codigoCompleto = digits.join('');

  const focusInput = (index) => {
    inputRefs.current[index]?.focus();
  };

  const handleChangeDigit = (index, event) => {
    const raw = event.target.value;

    if (raw && !/^\d$/.test(raw)) {
      return;
    }

    setDigits((atual) => {
      const proximo = [...atual];
      proximo[index] = raw;
      return proximo;
    });

    if (hasError) setHasError(false);

    if (raw && index < QUANTIDADE_DIGITOS - 1) {
      focusInput(index + 1);
    }
  };

  const handleKeyDownDigit = (index, event) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault();
      setDigits((atual) => {
        const proximo = [...atual];
        proximo[index - 1] = '';
        return proximo;
      });
      focusInput(index - 1);
    }
  };

  const handlePasteDigits = (event) => {
    event.preventDefault();
    const colado = event.clipboardData.getData('text').replace(/\D/g, '');

    if (colado.length === QUANTIDADE_DIGITOS) {
      setDigits(colado.split(''));
      setHasError(false);
      focusInput(QUANTIDADE_DIGITOS - 1);
    }
  };

  const handleConfirmar = async () => {
    if (codigoCompleto.length < QUANTIDADE_DIGITOS || confirmando) return;

    setConfirmando(true);
    try {
      await confirmarCodigoSms(codigoCompleto);
      setOtpVerified(true);
      navigate('/cadastro/senha');
    } catch (error) {
      setDigits(Array(QUANTIDADE_DIGITOS).fill(''));
      setHasError(true);
      focusInput(0);
      showToast(error.message, { variant: 'error' });
      setTimeout(() => setHasError(false), 400);
    } finally {
      setConfirmando(false);
    }
  };

  const handleReenviar = async () => {
    if (reenviando) return;

    setReenviando(true);
    try {
      await enviarCodigoSms(celular);
      showToast('Novo código enviado! Enviamos um novo código de 6 dígitos por SMS.', { variant: 'success' });
    } catch (error) {
      showToast(error.message, { variant: 'error' });
    } finally {
      setReenviando(false);
    }
  };

  return (
    <div className={styles.page}>
      <Header
        variant="step"
        sticky
        bordered
        blurred
        onBack={() => navigate('/cadastro')}
        meta="Etapa 3 de 4"
      />

      <main className={styles.content}>
        <IconHeading icon={MessageSquare} iconTone="var(--color-primary)" title="Código por SMS" align="center" compact />

        <p className={styles.smsInfo}>
          Enviamos um código de 6 dígitos para o número
          <br />
          <strong className={styles.smsPhone}>{formatarCelularParaExibicao(celular)}</strong>
        </p>

        <div className={styles.digits} onPaste={handlePasteDigits}>
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => {
                inputRefs.current[index] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(event) => handleChangeDigit(index, event)}
              onKeyDown={(event) => handleKeyDownDigit(index, event)}
              className={cx(styles.digitInput, hasError && styles.digitError)}
              aria-label={`Dígito ${index + 1} do código`}
            />
          ))}
        </div>

        <p className={styles.resendInfo}>
          Não recebeu?{' '}
          <button
            type="button"
            className={styles.resendButton}
            onClick={handleReenviar}
            disabled={reenviando}
          >
            Reenviar código
          </button>
        </p>
      </main>

      <footer className={styles.footer}>
        <Button
          fullWidth
          iconRight={ChevronRight}
          loading={confirmando}
          disabled={codigoCompleto.length < QUANTIDADE_DIGITOS}
          onClick={handleConfirmar}
        >
          Confirmar código
        </Button>
      </footer>
    </div>
  );
}
