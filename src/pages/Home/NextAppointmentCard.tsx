import { useNavigate } from 'react-router';
import { ArrowRight, Calendar, Lightbulb, Users } from 'lucide-react';
import Card from '../../components/ui/card';
import IconTile from '../../components/ui/icon-tile';
import type { NextAppointmentSummary } from '../../types';

interface NextAppointmentCardProps {
  appointment: NextAppointmentSummary;
}

export default function NextAppointmentCard({ appointment }: NextAppointmentCardProps) {
  const navigate = useNavigate();

  const { id, title, dayLabel, time, locationLabel, specialtyLabel, tip } = appointment;
  // O ícone já vem resolvido pelo tipo do compromisso (e pela especialidade,
  // quando ela refina) — não há mais um mapa local a manter aqui.
  const TipoIcon = appointment.icon;

  return (
    <Card elevation="raised" padding="md" onClick={() => navigate(`/agenda/${id}`)}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <IconTile icon={TipoIcon} size="md" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-[12.5px] font-semibold text-[var(--color-supera-seguranca)]">Próximo compromisso</p>
            <h2 className="text-[19px]/[1.3] font-semibold tracking-[-0.3px] text-foreground">{title}</h2>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] px-3 py-1.5 text-[13.5px] font-semibold text-foreground">
            <Calendar size={15} strokeWidth={2} className="text-primary" aria-hidden="true" />
            {dayLabel} · {time}
          </span>
          {locationLabel && <p className="px-1 text-[13px] text-muted-foreground">{locationLabel}</p>}
        </div>

        {/* Antes havia aqui o avatar e o nome do profissional. Nenhum dos dois
            existe para uma sessão de paciente: `professionals` não tem coluna de
            nome nem de foto, e `accounts.full_name` só é legível pelo dono. O
            que dá para dizer com verdade é a área que vai atender. */}
        {specialtyLabel && (
          <div className="flex items-center gap-3 rounded-[14px] bg-[color-mix(in_srgb,var(--color-primary)_7%,transparent)] px-3.5 py-2.5">
            <Users size={17} strokeWidth={2} aria-hidden="true" className="shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-foreground">Equipe de {specialtyLabel}</p>
              <p className="text-[12px] text-muted-foreground">vai te atender</p>
            </div>
          </div>
        )}

        {tip && (
          <p className="flex items-start gap-2.5 rounded-[14px] bg-[color-mix(in_srgb,var(--color-brand-gold)_12%,transparent)] px-3.5 py-2.5 text-[13px]/[1.5] text-foreground">
            <Lightbulb size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--color-brand-gold)]" aria-hidden="true" />
            <span>{tip}</span>
          </p>
        )}

        <div className="flex items-center justify-between border-t border-border pt-3.5 text-[13.5px] font-semibold text-[var(--color-supera-seguranca)]">
          <span>Ver detalhes do compromisso</span>
          <span
            aria-hidden="true"
            className="inline-flex size-7 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] text-primary"
          >
            <ArrowRight size={15} strokeWidth={2.2} />
          </span>
        </div>
      </div>
    </Card>
  );
}
