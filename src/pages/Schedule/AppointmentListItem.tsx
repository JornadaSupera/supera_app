import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import AppointmentStatusTag from './AppointmentStatusTag';
import { getAppointmentStatusTone } from '../../utils/appointments';
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
  const statusTone = compromisso.confirmedAt
    ? 'confirmed'
    : getAppointmentStatusTone(compromisso.statusCode);

  // O mapa contratado pede tipo junto de horário, local e profissional. O nome
  // do profissional o banco não entrega a uma sessão de paciente — no lugar
  // dele vai a área que atende.
  const detalhes = [
    compromisso.typeLabel,
    compromisso.specialty ? `com a equipe de ${compromisso.specialty.label}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // O card de lista do guia, como a `NavigationRow`: branco, fio claro, cantos
  // de 14 px e a sombra única dos cards. O ícone do tipo vai solto, no verde
  // escuro dos ícones — a agenda usa só o texto e as cores funcionais.
  return (
    <Link
      to={`/agenda/${compromisso.id}`}
      className="flex min-h-12 items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm transition-[border-color] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))]"
    >
      {/* O ícone de 24 px tem a altura da primeira linha do título (`text-body`,
          24 px): fica centrado nela sem ajuste. */}
      <Icon size={24} strokeWidth={2} aria-hidden="true" className="shrink-0 text-primary-deep" />

      {/* O espaço entre as linhas vem do `gap`: o reset global zera a margem do `p`. */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* O nome do compromisso quebra a linha em vez de ser cortado: ao lado
            da data, num celular de 320 px, sobrariam poucas letras. O `pt-[3px]`
            centra a linha de 18 px da data na primeira linha (24 px) do título. */}
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 break-words text-body font-semibold text-foreground">
            {compromisso.title}
          </p>
          <span className="shrink-0 pt-[3px] text-caption font-medium whitespace-nowrap text-muted-foreground">
            {compromisso.dateLabel}
          </span>
        </div>

        <p className="text-body-sm text-muted-foreground">
          {compromisso.time} · {compromisso.locationLabel}
        </p>

        {detalhes && (
          <p className="text-caption font-medium text-muted-foreground">{detalhes}</p>
        )}

        {selo && (
          <AppointmentStatusTag tone={statusTone} className="mt-1">
            {selo}
          </AppointmentStatusTag>
        )}
      </div>

      {/* A seta de 20 px da `NavigationRow`; o `mt-0.5` a centra na primeira
          linha (24 px) do título. */}
      <ChevronRight
        size={20}
        strokeWidth={2}
        className="mt-0.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}
