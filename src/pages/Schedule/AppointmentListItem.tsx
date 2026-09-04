import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import type { EnrichedAppointment } from '../../types';

interface AppointmentListItemProps {
  compromisso: EnrichedAppointment;
}

export default function AppointmentListItem({ compromisso }: AppointmentListItemProps) {
  const Icon = compromisso.icon;

  // 'Agendado' é o estado de todo compromisso futuro — dizê-lo em todas as
  // linhas não informa nada. O selo só aparece quando há algo a destacar: a
  // presença confirmada pelo paciente, ou um desfecho já registrado.
  const selo = compromisso.confirmedAt
    ? 'Presença confirmada'
    : compromisso.statusCode !== 'scheduled'
      ? compromisso.statusLabel
      : null;

  return (
    <Link
      to={`/agenda/${compromisso.id}`}
      className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        // Cor do ícone e do fundo variam por tipo/especialidade do
        // compromisso (`colorVar`) — sem classe Tailwind estática equivalente.
        style={
          {
            color: compromisso.colorVar,
            background: `color-mix(in srgb, ${compromisso.colorVar} 15%, transparent)`,
          } as CSSProperties
        }
      >
        <Icon size={16} strokeWidth={2} aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="overflow-hidden text-[14px] font-medium text-ellipsis whitespace-nowrap text-foreground">
            {compromisso.title}
          </p>
          <span className="flex-shrink-0 text-[11px] whitespace-nowrap text-muted-foreground">
            {compromisso.dateLabel}
          </span>
        </div>

        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {compromisso.time} · {compromisso.locationLabel}
        </p>

        {/* A área que atende, não a pessoa: o banco não expõe o nome do
            profissional a uma sessão de paciente. */}
        {compromisso.specialty && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            com a equipe de {compromisso.specialty.label}
          </p>
        )}

        {selo && (
          <span className="mt-1.5 inline-flex w-fit rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
            {selo}
          </span>
        )}
      </div>

      <ChevronRight
        size={16}
        strokeWidth={2}
        className="mt-0.5 flex-shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}
