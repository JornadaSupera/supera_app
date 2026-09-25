import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Users } from 'lucide-react';
import Avatar from '../../components/ui/avatar';
import Skeleton from '../../components/ui/skeleton';
import StatusChip from '../../components/ui/status-chip';
import { useMyCaregiver } from '../../hooks/useCaregiver';
import { getCaregiverErrorCode } from '../../lib/caregiverError';
import { getCaregiverStatus } from '../../utils/caregiverStatus';

const CAREGIVER_PATH = '/perfil/acompanhante';

interface CaregiverRowProps {
  leading: ReactNode;
  title: string;
  children?: ReactNode;
}

/** A linha que leva a "Meu acompanhante": o mesmo desenho das outras linhas do Perfil. */
function CaregiverRow({ leading, title, children }: CaregiverRowProps) {
  return (
    <Link
      to={CAREGIVER_PATH}
      className="flex min-h-[72px] items-center gap-3 rounded-xl border border-border bg-card p-4 transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm"
    >
      {leading}
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="text-[14px] font-semibold break-words text-foreground">{title}</span>
        {children}
      </span>
      <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

function UsersBadge() {
  return (
    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
      <Users size={18} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

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
      <CaregiverRow leading={<UsersBadge />} title="Meu acompanhante">
        <span className="text-[12px]/[1.4] text-muted-foreground">
          {unavailable ? 'Ainda não disponível.' : 'Não foi possível carregar. Toque para ver.'}
        </span>
      </CaregiverRow>
    );
  } else if (!caregiver) {
    row = (
      <CaregiverRow leading={<UsersBadge />} title="Adicionar acompanhante">
        <span className="text-[12px]/[1.4] text-muted-foreground">
          Uma pessoa de confiança acompanha a sua rotina, com login próprio.
        </span>
      </CaregiverRow>
    );
  } else {
    const status = getCaregiverStatus(caregiver);

    row = (
      <CaregiverRow
        leading={<Avatar size="lg" name={caregiver.fullName} className="bg-secondary" />}
        title={caregiver.fullName || 'Acompanhante'}
      >
        <StatusChip tone={status.tone}>{status.label}</StatusChip>
      </CaregiverRow>
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
