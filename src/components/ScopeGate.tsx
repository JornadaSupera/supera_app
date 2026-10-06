import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { EyeOff } from 'lucide-react';
import EmptyState from './ui/empty-state';
import Loading from './ui/loading';
import { useScopeAllowed } from '../hooks/useCaregiver';
import { describeScope } from '../utils/caregiverScopes';
import type { CaregiverScope } from '../types';

interface ScopeGateProps {
  scope: CaregiverScope;
  children: ReactNode;
}

/**
 * A tela de uma área que o titular retirou do acompanhante.
 *
 * NÃO é a barreira: quem esconde o dado é a RLS, que deixa de entregar a área
 * na hora ([BANCO 32]). O que esta guarda evita é a tela vazia — sem ela, o
 * acompanhante abriria a Agenda e leria "nenhum compromisso", que é mentira: há
 * compromissos, e ele não pode vê-los. Aqui a tela diz a verdade.
 *
 * Para o titular, e enquanto o banco não tem o controle por área, é
 * transparente: devolve a tela como sempre.
 */
export default function ScopeGate({ scope, children }: ScopeGateProps) {
  const navigate = useNavigate();
  const { allowed, isChecking } = useScopeAllowed(scope);

  if (isChecking) return <Loading />;
  if (allowed) return children;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-safe-8">
      <EmptyState
        className="min-h-0"
        icon={EyeOff}
        title="Não compartilhado com você"
        description={`${describeScope(scope)}: a pessoa que você acompanha não compartilhou esta área. Se precisar, converse com ela.`}
        actionLabel="Ir para o início"
        onAction={() => navigate('/home', { replace: true })}
      />
    </div>
  );
}
