import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ChevronRight, FingerprintPattern } from 'lucide-react';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Header from '../../components/Header';
import Card from '../../components/Card';
import Switch from '../../components/Switch';
import PasswordStrengthMeter from '../../components/PasswordStrengthMeter';
import { useToast } from '../../contexts/ToastContext';
import { useSignup } from '../../contexts/SignupContext';
import { concluirCadastro, atualizarPreferencia } from '../../services/mockApi';
import styles from './CreatePassword.module.css';

export default function CreatePassword() {
  const { otpVerified, reset } = useSignup();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [concluindo, setConcluindo] = useState(false);
  // Espelha patient.preferencias.biometria (default true em mocks/patient.js).
  // O protótipo já mostra este toggle ligado por padrão nesta etapa.
  const [biometria, setBiometria] = useState(true);

  // Bug real encontrado e corrigido nesta revisão: resetar o SignupContext
  // com `setTimeout(() => reset(), 0)` logo após `navigate('/home')` é uma
  // corrida que falha de verdade sempre que a rota de destino é lazy() (é o
  // caso de Home) — o import() dinâmico do chunk demora mais que um
  // setTimeout(0), então este componente ainda está montado quando o
  // reset() zera `otpVerified`, o que dispara o guard abaixo
  // (`<Navigate to="/cadastro" />`) e cancela a navegação para /home
  // (reproduzido de ponta a ponta: usuário conclui o cadastro e é jogado de
  // volta para a Etapa 2). A correção correta é adiar o reset para o
  // cleanup do useEffect, que só roda quando este componente realmente
  // desmonta — não importa quanto tempo o lazy-loading da próxima rota
  // leve.
  const concluidoComSucessoRef = useRef(false);
  const resetRef = useRef(reset);
  resetRef.current = reset;

  useEffect(() => {
    return () => {
      if (concluidoComSucessoRef.current) {
        resetRef.current();
      }
    };
  }, []);

  if (!otpVerified) {
    return <Navigate to="/cadastro" replace />;
  }

  const podeConcluir = senha.length >= 8 && senha === confirmarSenha;

  const handleToggleBiometria = (valor) => {
    setBiometria(valor);
    // Mesma preferência editável depois em Perfil > Preferências — grava
    // direto no mock compartilhado (fire-and-forget, mesmo padrão de
    // handleTogglePreferencia em ProfileHub.jsx).
    atualizarPreferencia('biometria', valor);
  };

  const handleConcluir = async () => {
    if (!podeConcluir || concluindo) return;

    setConcluindo(true);
    try {
      await concluirCadastro({ senha });
      localStorage.setItem('supera_onboarded', 'true');
      showToast('Cadastro concluído! Bem-vindo(a) à Jornada Supera.', { variant: 'success' });
      concluidoComSucessoRef.current = true;
      navigate('/home', { replace: true });
    } catch (error) {
      showToast(error.message, { variant: 'error' });
    } finally {
      setConcluindo(false);
    }
  };

  return (
    <div className={styles.page}>
      <Header
        variant="step"
        sticky
        bordered
        blurred
        onBack={() => navigate('/cadastro/otp')}
        meta="Etapa 4 de 4"
      />

      <main className={styles.main}>
        <h1 className={styles.title}>Crie sua senha</h1>
        <p className={styles.subtitle}>Use uma senha que você lembre — mas que ninguém adivinhe.</p>

        <div className={styles.form}>
          <div>
            <Input
              label="Senha"
              id="senha"
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo de 8 caracteres"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
            />
            <div className={styles.meter}>
              <PasswordStrengthMeter password={senha} />
            </div>
          </div>

          <Input
            label="Confirmar senha"
            id="confirma"
            type="password"
            autoComplete="new-password"
            placeholder="Repita a senha"
            value={confirmarSenha}
            onChange={(event) => setConfirmarSenha(event.target.value)}
            error={confirmarSenha && senha !== confirmarSenha ? 'As senhas não coincidem.' : undefined}
          />

          <Card padding="sm">
            <Switch
              id="biometria"
              checked={biometria}
              onChange={handleToggleBiometria}
              label={
                <span className={styles.biometryLabel}>
                  <span className={styles.biometryIconBadge}>
                    <FingerprintPattern size={16} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className={styles.biometryText}>
                    <span className={styles.biometryTitle}>Desbloquear com biometria</span>
                    <span className={styles.biometryDescription}>
                      Face ID / Touch ID — não precisa digitar a senha toda vez.
                    </span>
                  </span>
                </span>
              }
            />
          </Card>
        </div>
      </main>

      <footer className={styles.footer}>
        <Button
          fullWidth
          iconRight={ChevronRight}
          disabled={!podeConcluir}
          loading={concluindo}
          onClick={handleConcluir}
        >
          Concluir cadastro
        </Button>
      </footer>
    </div>
  );
}
