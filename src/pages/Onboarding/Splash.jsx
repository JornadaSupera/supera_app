import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { LogoMark } from '../../components/Logo';
import { useSessionStore } from '../../stores/sessionStore';
import styles from './Splash.module.css';

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    let ativo = true;

    const id = setTimeout(async () => {
      // O boot já dispara a leitura do cofre; se ela ainda não terminou,
      // aguarda aqui em vez de decidir com o status indefinido.
      if (useSessionStore.getState().status === 'verificando') {
        await useSessionStore.getState().carregar();
      }
      if (!ativo) return;

      const autenticado = useSessionStore.getState().status === 'autenticado';
      navigate(autenticado ? '/home' : '/onboarding', { replace: true });
    }, 1200);

    return () => {
      ativo = false;
      clearTimeout(id);
    };
  }, [navigate]);

  return (
    <div className={styles.splash}>
      <LogoMark size={96} />
    </div>
  );
}
