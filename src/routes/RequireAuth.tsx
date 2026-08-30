import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { Lock, User } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import { useSignOut } from '../hooks/useAuth';
import Loading from '../components/ui/loading';
import EmptyState from '../components/ui/empty-state';

// Guarda de rota. O estado da sessão vive na store, alimentada pelo
// `onAuthStateChange` do Supabase — ver `stores/sessionStore`.
//
// Autenticar não basta: o acesso ao conteúdo do app depende de a conta estar
// ativa E de existir um cadastro de paciente vinculado a ela. Os dois casos em
// que isso falha têm tela própria, e não uma lista vazia: sem vínculo, toda
// consulta clínica é negada pela RLS e devolve `[]` — o que na tela seria
// indistinguível de "você ainda não tem registros".

export default function RequireAuth({ children }: { children: ReactNode }) {
  const status = useSessionStore((state) => state.status);
  const signOutMutation = useSignOut();

  if (status === 'verificando') {
    return <Loading />;
  }

  if (status === 'anonimo') {
    return <Navigate to="/login" replace />;
  }

  if (status === 'conta-inativa') {
    return (
      <EmptyState
        icon={Lock}
        iconTone="var(--color-destructive)"
        title="Acesso desativado"
        description="Seu acesso à Jornada Supera foi desativado. Fale com a recepção do Centro para reativá-lo."
        actionLabel="Sair"
        onAction={() => signOutMutation.mutate()}
      />
    );
  }

  if (status === 'sem-vinculo') {
    return (
      <EmptyState
        icon={User}
        title="Cadastro ainda não vinculado"
        description="Sua conta foi criada, mas ainda não está ligada ao seu cadastro de paciente. Fale com a recepção do Centro para concluir a ativação."
        actionLabel="Sair"
        onAction={() => signOutMutation.mutate()}
      />
    );
  }

  return children;
}
