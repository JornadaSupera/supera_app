import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { LogoMark } from '../../components/Logo';
import { isAuthenticated } from '../../services/session';
import styles from './Splash.module.css';

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    let ativo = true;

    const id = setTimeout(async () => {
      const autenticado = await isAuthenticated();
      if (ativo) {
        navigate(autenticado ? '/home' : '/onboarding', { replace: true });
      }
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
