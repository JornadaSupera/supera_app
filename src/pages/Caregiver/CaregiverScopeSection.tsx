import { useState } from 'react';
import InlineError from '../../components/ui/inline-error';
import Skeleton from '../../components/ui/skeleton';
import ScopePanel from './ScopePanel';
import ScopeSwitches from './ScopeSwitches';
import { describeMutationError } from '../../hooks/useAuth';
import { useCaregiverScopes, useSetCaregiverScope } from '../../hooks/useCaregiver';
import { useToast } from '../../contexts/ToastContext';
import { describeScope } from '../../utils/caregiverScopes';
import type { CaregiverScope } from '../../types';

interface CaregiverScopeSectionProps {
  /** Primeiro nome do acompanhante, para os avisos. */
  name: string;
}

/**
 * As áreas do acompanhante, em "Meu acompanhante".
 *
 * Com o controle por área no banco ([BANCO 32]), cada área é um interruptor que
 * o titular liga e desliga a qualquer momento — e desligar tira a área do
 * acompanhante na hora, em toda consulta, porque quem cumpre é a RLS. Sem o
 * controle no banco, a seção mostra o escopo fixo, que é o que a RLS impõe hoje.
 *
 * Desligar todas as áreas é permitido aqui (diferente de criar): é o jeito de
 * pausar o acesso sem revogar o vínculo e sem ter de gerar senha nova depois.
 */
export default function CaregiverScopeSection({ name }: CaregiverScopeSectionProps) {
  const { showToast } = useToast();
  const scopesQuery = useCaregiverScopes();
  const setScope = useSetCaregiverScope();
  const [pendingScopes, setPendingScopes] = useState<ReadonlySet<CaregiverScope>>(() => new Set());

  if (scopesQuery.isPending) {
    return <Skeleton className="h-72 w-full rounded-2xl" aria-label="Carregando o que o acompanhante pode ver" />;
  }

  // Só falha de verdade chega aqui: "o banco ainda não tem o controle por área"
  // não é erro, é `supported: false`.
  if (scopesQuery.isError && scopesQuery.data === undefined) {
    return (
      <InlineError
        title="Não foi possível carregar o que o acompanhante pode ver"
        onRetry={() => void scopesQuery.refetch()}
      />
    );
  }

  const settings = scopesQuery.data;
  if (!settings?.supported) return <ScopePanel />;

  const values = Object.fromEntries(settings.scopes.map((item) => [item.scope, item.enabled])) as Record<
    CaregiverScope,
    boolean
  >;
  const since = Object.fromEntries(settings.scopes.map((item) => [item.scope, item.updatedAt]));

  async function handleToggle(scope: CaregiverScope, enabled: boolean) {
    setPendingScopes((current) => new Set(current).add(scope));
    try {
      await setScope.mutateAsync({ scope, enabled });
      const area = describeScope(scope);
      showToast(
        enabled ? `${area}: liberada para ${name}.` : `${area}: retirada de ${name}. Vale a partir de agora.`,
        { variant: 'success' }
      );
    } catch (error) {
      // O interruptor já voltou sozinho (ver `useSetCaregiverScope`).
      showToast(describeMutationError(error, 'Não foi possível alterar esta área.'), { variant: 'error' });
    } finally {
      setPendingScopes((current) => {
        const next = new Set(current);
        next.delete(scope);
        return next;
      });
    }
  }

  return (
    <ScopeSwitches
      values={values}
      since={since}
      pendingScopes={pendingScopes}
      onChange={(scope, enabled) => void handleToggle(scope, enabled)}
    />
  );
}
