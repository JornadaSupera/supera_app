import { useNavigate } from 'react-router';
import { Calendar, ChevronRight, Users } from 'lucide-react';
import Card from '../../components/ui/card';
import type { NextAppointmentSummary } from '../../types';

interface NextAppointmentCardProps {
  appointment: NextAppointmentSummary | null;
}

export default function NextAppointmentCard({ appointment }: NextAppointmentCardProps) {
  const navigate = useNavigate();

  if (!appointment) return null;

  const { id, title, dayLabel, time, locationLabel, specialtyLabel, tip } = appointment;
  // O ícone já vem resolvido pelo tipo do compromisso (e pela especialidade,
  // quando ela refina) — não há mais um mapa local a manter aqui.
  const TipoIcon = appointment.icon;

  return (
    <Card variant="primary" decorated padding="md" onClick={() => navigate(`/agenda/${id}`)}>
      <div className="flex items-center gap-2 text-[12px] font-medium tracking-[0.05em] uppercase opacity-80">
        <TipoIcon size={14} strokeWidth={2.5} aria-hidden="true" />
        <span>PRÓXIMO COMPROMISSO</span>
      </div>

      <h2 className="mt-2 text-[20px] leading-[1.375] font-semibold">{title}</h2>

      <div className="mt-3 flex flex-col gap-1 text-[14px] opacity-90">
        <div className="flex items-center gap-2">
          <Calendar size={14} strokeWidth={2} aria-hidden="true" />
          <span>
            {dayLabel} · {time}
          </span>
        </div>
        {locationLabel && <p className="text-[12px] opacity-80">{locationLabel}</p>}
      </div>

      {/* Antes havia aqui o avatar e o nome do profissional. Nenhum dos dois
          existe para uma sessão de paciente: `professionals` não tem coluna de
          nome nem de foto, e `accounts.full_name` só é legível pelo dono. O
          que dá para dizer com verdade é a área que vai atender. */}
      {specialtyLabel && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--color-primary-foreground)_10%,transparent)] px-3 py-2">
          <Users size={16} strokeWidth={2} aria-hidden="true" className="flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium">Equipe de {specialtyLabel}</p>
            <p className="text-[11px] opacity-80">vai te atender</p>
          </div>
        </div>
      )}

      {tip && (
        <p className="mt-3 rounded-lg bg-[color-mix(in_srgb,var(--color-primary-foreground)_10%,transparent)] px-3 py-2 text-[12px] opacity-90">
          💡 {tip}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--color-primary-foreground)_15%,transparent)] pt-3 text-[12px] font-medium">
        <span>Ver detalhes do compromisso</span>
        <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
      </div>
    </Card>
  );
}
