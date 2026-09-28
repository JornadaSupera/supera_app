import type { ReactNode } from 'react';
import { Users } from 'lucide-react';
import Avatar from '../../components/ui/avatar';
import NavigationRow from '../../components/ui/navigation-row';
import Skeleton from '../../components/ui/skeleton';
import StatusChip from '../../components/ui/status-chip';
import { useMyCaregiver } from '../../hooks/useCaregiver';
import { getCaregiverErrorCode } from '../../lib/caregiverError';
import { getCaregiverStatus } from '../../utils/caregiverStatus';

const CAREGIVER_PATH = '/perfil/acompanhante';

/**
 * "Meu acompanhante" no Perfil: a porta de entrada da gestão do acompanhante.
 *
 * Mostra só quem é e em que ponto está (nome e situação) — celular e e-mail
 * ficam na tela de gestão, mascarados, e só se revelam por ação explícita. Só
 * o titular vê esta seção (quem chama decide), e só com o módulo ligado.
 *
 * Todo estado leva à mesma tela, que tem o seu próprio tratamento de erro e de
 * nova tentativa: aqui o erro não vira um beco sem saída nem esconde a seção.
 */
export default function CaregiverProfileSection() {
  // `isPending`, não `isLoading`: sem rede a consulta fica pausada, sem dado e
  // sem erro, e `isLoading` falso levaria ao falso "Adicionar acompanhante" de
  // quem já tem um. Pausada, a linha continua carregando até a rede voltar.
  const { data: caregiver, isPending, isError, error } = useMyCaregiver();

  let row: ReactNode;

  if (isPending) {
    row = <Skeleton className="h-[72px] w-full rounded-xl" />;
  } else if (isError && caregiver === undefined) {
    const unavailable = getCaregiverErrorCode(error) === 'unavailable';

    row = (
      <NavigationRow
        to={CAREGIVER_PATH}
        icon={Users}
        title="Meu acompanhante"
        description={unavailable ? 'Ainda não disponível.' : 'Não foi possível carregar. Toque para ver.'}
      />
    );
  } else if (!caregiver) {
    row = (
      <NavigationRow
        to={CAREGIVER_PATH}
        icon={Users}
        title="Adicionar acompanhante"
        description="Uma pessoa de confiança acompanha a sua rotina, com login próprio."
      />
    );
  } else {
    const status = getCaregiverStatus(caregiver);

    row = (
      <NavigationRow
        to={CAREGIVER_PATH}
        leading={<Avatar size="lg" name={caregiver.fullName} className="bg-secondary" />}
        title={caregiver.fullName || 'Acompanhante'}
      >
        <StatusChip tone={status.tone}>{status.label}</StatusChip>
      </NavigationRow>
    );
  }

  return (
    <section aria-busy={isPending}>
      <h2 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
        MEU ACOMPANHANTE
      </h2>
      {row}
    </section>
  );
}
