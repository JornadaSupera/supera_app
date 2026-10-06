import { useNavigate } from 'react-router';
import { Calendar, ChevronRight, Lightbulb, Users } from 'lucide-react';
import Card from '../../components/ui/card';
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
        {/* Ícone de traço ao lado do rótulo, sem pastilha: no guia, o ícone e o
            rótulo vão no verde escuro, e o título no texto principal. */}
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-label font-semibold text-primary-deep">
            <TipoIcon size={24} strokeWidth={2} aria-hidden="true" className="shrink-0" />
            Próximo compromisso
          </p>
          <h2 className="text-card-title font-bold text-foreground">{title}</h2>
        </div>

        {/* A pílula do dia e o local são um grupo: 8 px entre os dois, o vão
            do guia para elementos de um mesmo grupo. */}
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-secondary px-3 py-1 text-label font-semibold text-foreground">
            <Calendar size={20} strokeWidth={2} className="text-primary-deep" aria-hidden="true" />
            {dayLabel} · {time}
          </span>
          {locationLabel && <p className="text-body-sm text-muted-foreground">{locationLabel}</p>}
        </div>

        {/* Antes havia aqui o avatar e o nome do profissional. Nenhum dos dois
            existe para uma sessão de paciente: `professionals` não tem coluna de
            nome nem de foto, e `accounts.full_name` só é legível pelo dono. O
            que dá para dizer com verdade é a área que vai atender. Caixa de
            destaque do guia, no verde claro (`surface-teal`). */}
        {specialtyLabel && (
          <div className="flex items-center gap-3 rounded-lg bg-secondary px-4 py-3">
            <Users size={24} strokeWidth={2} aria-hidden="true" className="shrink-0 text-primary-deep" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-label font-semibold text-foreground">Equipe de {specialtyLabel}</p>
              <p className="text-caption font-medium text-muted-foreground">vai te atender</p>
            </div>
          </div>
        )}

        {/* Preparo é lembrete: no guia, bloco laranja claro com o texto no
            laranja escuro. O ícone fica na primeira linha da frase: o
            `-my-[1.5px]` centra os 24 px na linha de 21 px do `text-body-sm`. */}
        {tip && (
          <div className="flex items-start gap-3 rounded-lg bg-orange-soft px-4 py-3">
            <Lightbulb
              size={24}
              strokeWidth={2}
              aria-hidden="true"
              className="-my-[1.5px] shrink-0 text-orange-deep"
            />
            <p className="text-body-sm text-orange-deep">{tip}</p>
          </div>
        )}

        <div className="flex min-h-11 items-center justify-between border-t border-border pt-3 text-label font-semibold text-primary-deep">
          <span>Ver detalhes do compromisso</span>
          <ChevronRight size={24} strokeWidth={2} aria-hidden="true" />
        </div>
      </div>
    </Card>
  );
}
