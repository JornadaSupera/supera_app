import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { isAuthenticated } from '../services/session';
import Loading from '../components/Loading';

// A sessão vive em armazenamento criptografado, cuja leitura é assíncrona —
// por isso o guard tem três estados em vez de decidir na hora. Enquanto
// verifica, mostra o Loading: redirecionar antes da resposta chutaria o
// usuário autenticado para o login a cada abertura do app.
export default function RequireAuth({ children }) {
  const [status, setStatus] = useState('verificando');

  useEffect(() => {
    let ativo = true;

    isAuthenticated().then((autenticado) => {
      if (ativo) {
        setStatus(autenticado ? 'autenticado' : 'anonimo');
      }
    });

    return () => {
      ativo = false;
    };
  }, []);

  if (status === 'verificando') {
    return <Loading />;
  }

  if (status === 'anonimo') {
    return <Navigate to="/login" replace />;
  }

  return children;
}
