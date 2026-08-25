import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ChevronRight } from 'lucide-react';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Header from '../../components/Header';
import PasswordStrengthMeter from '../../components/PasswordStrengthMeter';
import { useToast } from '../../contexts/ToastContext';
import { redefinirSenha } from '../../services/mockApi';
import styles from './NewPassword.module.css';

export default function NewPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [salvando, setSalvando] = useState(false);

  const identificador = location.state?.identificador;

  // Guarda de rota: só permite acesso vindo da tela de recuperação de senha,
  // que envia o identificador via state do react-router. Todos os hooks
  // acima precisam ser chamados antes deste retorno condicional.
  if (!identificador) {
    return <Navigate to="/recuperar-senha" replace />;
  }

  const podeConcluir = senha.length >= 8 && senha === confirmarSenha;

  const handleRedefinir = async () => {
    if (!podeConcluir || salvando) return;

    setSalvando(true);
    try {
      await redefinirSenha({ senha });
      showToast('Senha redefinida com sucesso. Faça login com sua nova senha.', { variant: 'success' });
      navigate('/login', { replace: true });
    } catch (error) {
      showToast(error.message, { variant: 'error' });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className={styles.page}>
      <Header title="Nova senha" onBack={() => navigate('/recuperar-senha')} sticky bordered />

      <main className={styles.main}>
        <p className={styles.subtitle}>
          Crie uma senha nova para sua conta. Use uma senha que você lembre — mas que ninguém adivinhe.
        </p>

        <div className={styles.form}>
          <div>
            <Input
              label="Nova senha"
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
            label="Confirmar nova senha"
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
          loading={salvando}
          onClick={handleRedefinir}
        >
          Redefinir senha
        </Button>
      </footer>
    </div>
  );
}
