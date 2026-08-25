import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { LogoMark } from '../../components/Logo';
import { isAuthenticated } from '../../services/session';
import styles from './Splash.module.css';

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    const id = setTimeout(() => {
      const destino = isAuthenticated() ? '/home' : '/onboarding';
      navigate(destino, { replace: true });
    }, 1200);

    return () => clearTimeout(id);
  }, [navigate]);

  return (
    <div className={styles.splash}>
      <LogoMark size={96} />
    </div>
  );
}
