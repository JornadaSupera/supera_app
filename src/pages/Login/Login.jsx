import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, FingerprintPattern } from 'lucide-react';
import Button from '../../components/Button';
import Input from '../../components/Input';
import { LogoMark } from '../../components/Logo';
import { useToast } from '../../contexts/ToastContext';
import { login, getPatient } from '../../services/mockApi';
import { isBiometricAvailable, authenticateWithBiometric } from '../../services/biometric';
import { login as iniciarSessao } from '../../services/session';
import { identifyPushUser } from '../../services/pushNotifications';
import styles from './Login.module.css';

// Ícones de marca (Google/Apple) não existem no lucide-react — inline SVG
// fiel ao protótipo (`.../paciente/login/`), só usado nesta tela.
function GoogleIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function AppleIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.47-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState(null);
  const [paciente, setPaciente] = useState(null);
  const [biometriaDisponivel, setBiometriaDisponivel] = useState(false);
  const [autenticandoBiometria, setAutenticandoBiometria] = useState(false);

  useEffect(() => {
    async function verificarBiometria() {
      const [pacienteData, disponivel] = await Promise.all([getPatient(), isBiometricAvailable()]);
      setPaciente(pacienteData);
      setBiometriaDisponivel(Boolean(pacienteData.preferencias.biometria) && disponivel);
    }
    verificarBiometria();
  }, []);

  const irParaHome = (mensagem) => {
    iniciarSessao();
    if (paciente) identifyPushUser(paciente.id);
    showToast(mensagem, { variant: 'success' });
    navigate('/home', { replace: true });
  };

  const handleEntrar = async () => {
    if (entrando) return;

    setErro(null);
    setEntrando(true);

    try {
      await login({ email, senha });
      irParaHome('Login efetuado. Bem-vindo(a) à Jornada Supera.');
    } catch (error) {
      setErro(error.message);
      showToast(error.message, { variant: 'error' });
    } finally {
      setEntrando(false);
    }
  };

  const handleBiometricLogin = async () => {
    if (autenticandoBiometria) return;

    setAutenticandoBiometria(true);
    try {
      const autenticado = await authenticateWithBiometric();
      if (autenticado) {
        irParaHome('Identidade confirmada. Bem-vindo(a) de volta à Jornada Supera.');
      } else {
        showToast('Não foi possível confirmar sua biometria. Tente novamente ou use sua senha.', {
          variant: 'error',
        });
      }
    } finally {
      setAutenticandoBiometria(false);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.content}>
        <div className={styles.hero}>
          <LogoMark size={48} />
          <h1 className={styles.title}>Bem-vindo de volta</h1>
          <p className={styles.subtitle}>Entre para acompanhar seu tratamento.</p>
        </div>

        {erro && (
          <div className={styles.alert} role="alert">
            {erro}
          </div>
        )}

        <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
          <Input
            label="E-mail"
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="voce@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <div>
            <div className={styles.passwordHeader}>
              <label htmlFor="senha" className={styles.passwordLabel}>
                Senha
              </label>
              <button
                type="button"
                className={styles.forgotLink}
                onClick={() => navigate('/recuperar-senha')}
              >
                Esqueci minha senha
              </button>
            </div>
            <Input
              id="senha"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
            />
          </div>
        </form>

        <div className={styles.divider}>
          <span className={styles.dividerLine} aria-hidden="true" />
          <span className={styles.dividerText}>ou</span>
          <span className={styles.dividerLine} aria-hidden="true" />
        </div>

        <div className={styles.socialButtons}>
          {biometriaDisponivel && (
            <Button
              fullWidth
              variant="outline"
              iconLeft={FingerprintPattern}
              loading={autenticandoBiometria}
              onClick={handleBiometricLogin}
            >
              Entrar com biometria
            </Button>
          )}
          <Button
            fullWidth
            variant="outline"
            iconLeft={GoogleIcon}
            onClick={() =>
              showToast('O login com Google não está disponível nesta demonstração.', {
                variant: 'info',
              })
            }
          >
            Entrar com Google
          </Button>
          <Button
            fullWidth
            variant="outline"
            iconLeft={AppleIcon}
            onClick={() =>
              showToast('O login com Apple não está disponível nesta demonstração.', {
                variant: 'info',
              })
            }
          >
            Entrar com Apple
          </Button>
        </div>

        <p className={styles.signupHint}>
          Ainda não tem conta?{' '}
          <Link to="/onboarding" className={styles.signupLink}>
            Criar conta
          </Link>
        </p>
      </main>

      <footer className={styles.footer}>
        <Button fullWidth iconRight={ArrowRight} loading={entrando} onClick={handleEntrar}>
          Entrar
        </Button>
      </footer>
    </div>
  );
}
