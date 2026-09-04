import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight } from 'lucide-react';
import Card from '../../components/ui/card';
import type { CareTeamSpecialtyOption } from '../../types';

interface CareTeamTeaserProps {
  specialties?: CareTeamSpecialtyOption[];
}

/**
 * Empilhado de especialidades — não de pessoas. `accounts_select_own` não
 * abre o nome do profissional para o paciente (mesma parede do Chat e do
 * Cuidador), então "sua equipe" aqui é honesto sobre o que dá para mostrar:
 * quais áreas participam do cuidado, não quem exatamente está por trás.
 */
export default function CareTeamTeaser({ specialties = [] }: CareTeamTeaserProps) {
  const navigate = useNavigate();
  // Derivado da própria lista, não recebido como prop à parte: um total
  // vindo separado poderia divergir de `specialties.length` (o chamador
  // passando um sem o outro), e é exatamente esse campo que decide se o
  // card aparece.
  const total = specialties.length;

  // Sem compromisso algum marcado ainda, não há especialidade para contar —
  // o card sumir é mais honesto que mostrar "0 cuidando de você".
  if (total === 0) return null;

  return (
    <Card onClick={() => navigate('/chat')} padding="md" className="w-full text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-[var(--color-supera-empatia)]">
            Sua equipe está com você
          </p>
          <p className="mt-[2px] text-[11px]/[1.5] text-muted-foreground">
            Quando precisar de algo, a gente está a um chat de distância 💙
          </p>
        </div>
        <ChevronRight
          size={16}
          strokeWidth={2}
          className="mt-1 flex-shrink-0 text-[var(--color-supera-empatia)]"
          aria-hidden="true"
        />
      </div>

      <div className="mt-3 flex items-center">
        {specialties.map((especialidade, index) => {
          const Icon = especialidade.info.icon;

          return (
            <span
              key={especialidade.code}
              // `role="img"` + `aria-label`: o app é mobile-first (touch), e
              // `title` sozinho (tooltip de hover) nunca aparece em toque —
              // só em mouse. Sem isso, a bolha não tem nome nenhum para
              // quem usa leitor de tela.
              role="img"
              aria-label={especialidade.label}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-card bg-[color-mix(in_srgb,var(--specialty-color)_15%,transparent)] text-[var(--specialty-color)]"
              // Empilhamento: deslocamento e camada dependem da posição de
              // cada especialidade na lista carregada da API — não há classe
              // estática que expresse isso. A cor também varia por
              // instância, mesmo mecanismo de `--tag-color` (ui/tag.tsx).
              style={
                {
                  marginLeft: index > 0 ? '-8px' : 0,
                  zIndex: specialties.length - index,
                  '--specialty-color': especialidade.info.colorVar,
                } as CSSProperties
              }
              title={especialidade.label}
            >
              <Icon size={16} strokeWidth={2} aria-hidden="true" />
            </span>
          );
        })}
        <span className="ml-3 text-[11px] text-muted-foreground">
          {total === 1 ? '1 especialidade cuidando de você' : `${total} especialidades cuidando de você`}
        </span>
      </div>
    </Card>
  );
}
