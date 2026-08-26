import { Navigate } from 'react-router';
import { useSessionStore } from '../stores/sessionStore';
import Loading from '../components/Loading';

// O estado da sessão vive na store, alimentada uma única vez no boot
// (`main.tsx`). Enquanto o cofre criptografado ainda não respondeu, o status é
// 'verificando' e mostramos o Loading: redirecionar antes da resposta chutaria
// o usuário autenticado para o login a cada abertura do app.
export default function RequireAuth({ children }) {
  const status = useSessionStore((state) => state.status);

  if (status === 'verificando') {
    return <Loading />;
  }

  if (status === 'anonimo') {
    return <Navigate to="/login" replace />;
  }

  return children;
}
