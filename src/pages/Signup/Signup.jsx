import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight } from 'lucide-react';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Header from '../../components/Header';
import { useToast } from '../../contexts/ToastContext';
import { useSignup } from '../../contexts/SignupContext';
import { verificarIdentidade } from '../../services/mockApi';
import { formatCPF, formatPhone } from '../../utils/masks';
import { isValidCPF, isValidPhone, isValidBirthDate } from '../../utils/validators';
import styles from './Signup.module.css';

export default function Signup() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { setIdentidade } = useSignup();

  const [cpf, setCpf] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [celular, setCelular] = useState('');

  const [cpfTocado, setCpfTocado] = useState(false);
  const [nascimentoTocado, setNascimentoTocado] = useState(false);
  const [celularTocado, setCelularTocado] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [erroSubmissao, setErroSubmissao] = useState(null);

  const handleSubmit = async () => {
    const cpfValido = isValidCPF(cpf);
    const nascimentoValido = isValidBirthDate(nascimento);
    const celularValido = isValidPhone(celular);

    if (!cpfValido || !nascimentoValido || !celularValido) {
      setCpfTocado(true);
      setNascimentoTocado(true);
      setCelularTocado(true);
      return;
    }

    setErroSubmissao(null);
    setEnviando(true);

    try {
      await verificarIdentidade({ cpf, nascimento, celular });
      setIdentidade({ cpf, nascimento, celular });
      navigate('/cadastro/otp');
    } catch (error) {
      setErroSubmissao(error.message);
      showToast(error.message, { variant: 'error' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className={styles.page}>
      <Header
        variant="step"
        sticky
        bordered
        blurred
        onBack={() => navigate('/onboarding/lgpd')}
        meta="Etapa 2 de 4"
      />

      <main className={styles.content}>
        <h1 className={styles.title}>Vamos te identificar</h1>
        <p className={styles.description}>
          Esses dados já estão no seu cadastro no Centro. Só confirmamos para ter certeza de que é você mesmo.
        </p>

        {erroSubmissao && (
          <div className={styles.alert} role="alert">
            {erroSubmissao}
          </div>
        )}

        <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
          <Input
            label="CPF"
            id="cpf"
            value={cpf}
            onChange={(event) => setCpf(formatCPF(event.target.value))}
            onBlur={() => setCpfTocado(true)}
            placeholder="000.000.000-00"
            inputMode="numeric"
            error={cpfTocado && cpf && !isValidCPF(cpf) ? 'CPF inválido.' : undefined}
          />

          <Input
            label="Data de nascimento"
            id="nascimento"
            type="date"
            value={nascimento}
            onChange={(event) => setNascimento(event.target.value)}
            onBlur={() => setNascimentoTocado(true)}
            error={
              nascimentoTocado && nascimento && !isValidBirthDate(nascimento)
                ? 'Data de nascimento inválida.'
                : undefined
            }
          />

          <Input
            label="Celular"
            id="celular"
            value={celular}
            onChange={(event) => setCelular(formatPhone(event.target.value))}
            onBlur={() => setCelularTocado(true)}
            placeholder="(00) 00000-0000"
            inputMode="tel"
            error={celularTocado && celular && !isValidPhone(celular) ? 'Número de celular inválido.' : undefined}
            helperText="Vamos enviar um código por SMS para confirmar."
          />
        </form>
      </main>

      <footer className={styles.footer}>
        <Button fullWidth iconRight={ChevronRight} loading={enviando} onClick={handleSubmit}>
          Enviar código SMS
        </Button>
      </footer>
    </div>
  );
}
