import { History, KeyRound, MessageCircle, Smartphone } from 'lucide-react';
import StatusChip from '../../components/ui/status-chip';
import ExpansionTile from '../../components/ui/expansion-tile';
import { formatDateBr, formatDateTimeBr } from '../../utils/date';
import type { CaregiverIssuance, CaregiverLink } from '../../types';

interface LinkHistoryProps {
  links: CaregiverLink[];
  /** As senhas provisórias emitidas, se já foram lidas. */
  issuances?: CaregiverIssuance[];
}

/**
 * O que a pastilha mostra em cada estado. `pending` é vínculo CORRENTE, e não
 * passado: o titular já autorizou, e o acesso começa quando o acompanhante
 * trocar a senha provisória.
 */
const STATUS_CHIP: Record<CaregiverLink['status'], { tone: 'active' | 'waiting' | 'revoked'; label: string }> = {
  active: { tone: 'active', label: 'Ativo' },
  pending: { tone: 'waiting', label: 'Aguardando primeiro acesso' },
  revoked: { tone: 'revoked', label: 'Revogado' },
};

/**
 * O período do vínculo, com a distinção que o banco passou a registrar:
 * `granted_at` é quando o titular AUTORIZOU, `activated_at` é quando o acesso
 * de fato começou (a troca da senha provisória). Entre os dois podem passar até
 * 72 h — e um vínculo revogado antes da troca nunca deu acesso a nada.
 */
function describePeriod(link: CaregiverLink): string {
  const autorizado = `Autorizado em ${formatDateBr(link.grantedAt)}`;

  if (link.status === 'pending') return `${autorizado} · acesso ainda não começou`;

  if (link.status === 'revoked') {
    const fim = link.revokedAt ? formatDateBr(link.revokedAt) : null;
    if (!link.activatedAt) {
      return fim ? `${autorizado} · revogado em ${fim}, sem nunca ter dado acesso` : `${autorizado} · revogado`;
    }
    return fim
      ? `${autorizado} · acesso de ${formatDateBr(link.activatedAt)} a ${fim}`
      : `${autorizado} · acesso desde ${formatDateBr(link.activatedAt)}`;
  }

  return link.activatedAt
    ? `${autorizado} · acesso valendo desde ${formatDateBr(link.activatedAt)}`
    : autorizado;
}

const ISSUANCE_REASON: Record<CaregiverIssuance['reason'], string> = {
  created: 'Senha provisória do cadastro',
  reset: 'Nova senha provisória',
};

/**
 * Cada senha provisória que saiu: por que, por onde e até quando valia. A senha
 * nunca aparece — o banco guarda a emissão, não o segredo.
 */
function IssuanceList({ issuances }: { issuances: CaregiverIssuance[] }) {
  return (
    <ul role="list" className="flex flex-col">
      {issuances.map((issuance) => {
        const Icon = issuance.channel === 'whatsapp' ? MessageCircle : Smartphone;
        return (
          <li
            key={issuance.id}
            className="flex items-start gap-2.5 border-b border-border py-2.5 last:border-b-0 last:pb-0"
          >
            <Icon size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground">{ISSUANCE_REASON[issuance.reason]}</p>
              <p className="text-[12px] text-muted-foreground">
                {formatDateTimeBr(issuance.issuedAt)} · por{' '}
                {issuance.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} · valia até{' '}
                {formatDateTimeBr(issuance.expiresAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Registro das autorizações: quando cada vínculo foi autorizado, quando o
 * acesso começou de fato e, se foi o caso, quando foi revogado — mais as senhas
 * provisórias emitidas.
 *
 * É o que o contrato pede ("timestamp de cada vínculo e revogação") e o que
 * responde, sem depender da clínica, "quem teve acesso aos meus dados e
 * quando". Sem nome de acompanhante: o banco não deixa o titular ler a conta
 * dele, e as datas bastam.
 *
 * As emissões ficam recolhidas: são detalhe de investigação, não a informação
 * principal da tela (mesmo padrão dos interruptores do Perfil).
 */
export default function LinkHistory({ links, issuances = [] }: LinkHistoryProps) {
  if (links.length === 0) return null;

  return (
    <section className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <History size={18} strokeWidth={2} className="text-[var(--color-supera-seguranca)]" aria-hidden="true" />
        <h2 className="text-[14px] font-semibold text-foreground">Registro de autorizações</h2>
      </div>

      <ul role="list" className="flex flex-col">
        {links.map((link) => {
          const chip = STATUS_CHIP[link.status];
          const corrente = link.status !== 'revoked';

          return (
            <li
              key={link.id}
              className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-b-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-foreground">
                  {corrente ? 'Vínculo atual' : 'Vínculo anterior'}
                </p>
                <p className="text-[12px]/[1.45] text-muted-foreground">{describePeriod(link)}</p>
              </div>
              <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
            </li>
          );
        })}
      </ul>

      {issuances.length > 0 && (
        <ExpansionTile
          className="mt-2"
          variant="contained"
          headingLevel={3}
          icon={KeyRound}
          title="Senhas provisórias emitidas"
          subtitle={`${issuances.length} ${issuances.length === 1 ? 'emissão registrada' : 'emissões registradas'}`}
        >
          <IssuanceList issuances={issuances} />
        </ExpansionTile>
      )}
    </section>
  );
}
