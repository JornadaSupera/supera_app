import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogoMark } from '../../components/Logo';
import styles from './Splash.module.css';

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    const id = setTimeout(() => {
      const destino = localStorage.getItem('supera_onboarded') === 'true' ? '/home' : '/onboarding';
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
