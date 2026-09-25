import { History } from 'lucide-react';
import StatusChip from '../../components/ui/status-chip';
import { formatDateBr } from '../../utils/date';
import type { CaregiverLink } from '../../types';

interface LinkHistoryProps {
  links: CaregiverLink[];
}

/** O período do vínculo: aberto ("Desde 24/09/2026") ou fechado ("03/08/2026 a 19/09/2026"). */
function describePeriod(link: CaregiverLink): string {
  if (link.status === 'active' || !link.revokedAt) return `Desde ${formatDateBr(link.grantedAt)}`;
  return `${formatDateBr(link.grantedAt)} a ${formatDateBr(link.revokedAt)}`;
}

/**
 * Histórico de vínculos: quando cada um começou e, se foi o caso, quando foi
 * revogado. É o que o contrato pede ("timestamp de cada vínculo e revogação").
 * Sem nome de acompanhante: o banco não deixa o titular ler a conta dele, e as
 * datas bastam para o histórico.
 */
export default function LinkHistory({ links }: LinkHistoryProps) {
  if (links.length === 0) return null;

  return (
    <section className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <History size={18} strokeWidth={2} className="text-[var(--color-supera-seguranca)]" aria-hidden="true" />
        <h2 className="text-[14px] font-semibold text-foreground">Histórico de vínculos</h2>
      </div>

      <ul role="list" className="flex flex-col">
        {links.map((link) => (
          <li key={link.id} className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-b-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-foreground">
                {link.status === 'active' ? 'Vínculo atual' : 'Vínculo anterior'}
              </p>
              <p className="text-[12px] text-muted-foreground">{describePeriod(link)}</p>
            </div>
            <StatusChip tone={link.status === 'active' ? 'active' : 'revoked'}>
              {link.status === 'active' ? 'Ativo' : 'Revogado'}
            </StatusChip>
          </li>
        ))}
      </ul>
    </section>
  );
}
