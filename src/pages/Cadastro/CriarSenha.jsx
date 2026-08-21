import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Header from '../../components/Header';
import PasswordStrengthMeter from '../../components/PasswordStrengthMeter';
import { useToast } from '../../contexts/ToastContext';
import { useCadastro } from '../../contexts/CadastroContext';
import { concluirCadastro } from '../../services/mockApi';
import styles from './CriarSenha.module.css';

export default function CriarSenha() {
  const { otpVerified, reset } = useCadastro();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [concluindo, setConcluindo] = useState(false);

  if (!otpVerified) {
    return <Navigate to="/cadastro" replace />;
  }

  const podeConcluir = senha.length >= 8 && senha === confirmarSenha;

  const handleConcluir = async () => {
    if (!podeConcluir || concluindo) return;

    setConcluindo(true);
    try {
      await concluirCadastro({ senha });
      localStorage.setItem('supera_onboarded', 'true');
      showToast('Cadastro concluído! Bem-vindo(a) à Jornada Supera.', { variant: 'success' });
      navigate('/home', { replace: true });
      // Adiado para depois que a navegação for concluída e esta tela (e a
      // tela de OTP, que também observa o contexto) já tiver desmontado —
      // resetar o contexto no mesmo tick da navegação faz o guard de rota
      // dessas telas disparar de volta para /cadastro antes da troca de
      // rota se assentar.
      setTimeout(() => reset(), 0);
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
