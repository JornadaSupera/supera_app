import { useNavigate } from 'react-router';
import {
  Calendar,
  ChevronRight,
  ClipboardList,
  FlaskConical,
  Package,
  Stethoscope,
  Syringe,
} from 'lucide-react';
import Card from '../../components/ui/card';
import Avatar from '../../components/ui/avatar';
import type { NextAppointmentSummary } from '../../types';

// `avaliacao` nunca é produzido por `AppointmentType` (fechado a 'infusao' |
// 'consulta' | 'exame' | 'retirada' em src/types/appointments.ts) — mantido
// pelo mesmo motivo do `.jsx` original: fallback defensivo caso o backend
// real amplie o enum. Sem anotação de tipo explícita para não perder a
// 5ª chave por excess property check; a indexação abaixo só usa as 4 chaves
// de `AppointmentType`, então continua totalmente tipada.
const TIPO_ICONS = {
  infusao: Syringe,
  consulta: Stethoscope,
  retirada: Package,
  exame: FlaskConical,
  avaliacao: ClipboardList,
};

interface NextAppointmentCardProps {
  appointment: NextAppointmentSummary | null;
}

export default function NextAppointmentCard({ appointment }: NextAppointmentCardProps) {
  const navigate = useNavigate();

  if (!appointment) return null;

  const { id, tipo, titulo, diaLabel, hora, local, profissional, dica } = appointment;
  const TipoIcon = TIPO_ICONS[tipo] || ClipboardList;

  return (
    <Card variant="primary" decorated padding="md" onClick={() => navigate(`/agenda/${id}`)}>
      <div className="flex items-center gap-2 text-[12px] font-medium tracking-[0.05em] uppercase opacity-80">
        <TipoIcon size={14} strokeWidth={2.5} aria-hidden="true" />
        <span>PRÓXIMO COMPROMISSO</span>
      </div>

      <h2 className="mt-2 text-[20px] leading-[1.375] font-semibold">{titulo}</h2>

      <div className="mt-3 flex flex-col gap-1 text-[14px] opacity-90">
        <div className="flex items-center gap-2">
          <Calendar size={14} strokeWidth={2} aria-hidden="true" />
          <span>
            {diaLabel} · {hora}
          </span>
        </div>
        {local && <p className="text-[12px] opacity-80">{local}</p>}
      </div>

      {profissional && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--color-primary-foreground)_10%,transparent)] px-3 py-2">
          {/* Avatar ainda não foi migrado — 28px e o anel na cor
              --color-primary-foreground não têm prop equivalente, então
              seguem via `style` (ver mesmo comentário em GreetingHeader). */}
          <Avatar
            name={profissional.nome}
            src={profissional.foto}
            size="sm"
            ring
            style={{
              width: 28,
              height: 28,
              boxShadow:
                '0 0 0 1px color-mix(in srgb, var(--color-primary-foreground) 30%, transparent)',
            }}
          />
          <div className="min-w-0">
            <p className="text-[13px] font-medium">
              {profissional.cargo} {profissional.nome}
            </p>
            <p className="text-[11px] opacity-80">vai te atender</p>
          </div>
        </div>
      )}

      {dica && (
        <p className="mt-3 rounded-lg bg-[color-mix(in_srgb,var(--color-primary-foreground)_10%,transparent)] px-3 py-2 text-[12px] opacity-90">
          💡 {dica}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--color-primary-foreground)_15%,transparent)] pt-3 text-[12px] font-medium">
        <span>Ver detalhes do compromisso</span>
        <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
      </div>
    </Card>
  );
}
