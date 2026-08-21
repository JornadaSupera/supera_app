import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Button from '../../components/Button';
import Input from '../../components/Input';
import { LogoMark } from '../../components/Logo';
import { useToast } from '../../contexts/ToastContext';
import { login } from '../../services/mockApi';
import styles from './Login.module.css';

export default function Login() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState(null);

  const handleEntrar = async () => {
    if (entrando) return;

    setErro(null);
    setEntrando(true);

    try {
      await login({ email, senha });
      localStorage.setItem('supera_onboarded', 'true');
      navigate('/home', { replace: true });
    } catch (error) {
      setErro(error.message);
      showToast(error.message, { variant: 'error' });
    } finally {
      setEntrando(false);
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
