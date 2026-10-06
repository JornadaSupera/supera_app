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
 *
 * Todas as bolhas no verde da etiqueta de especialidade do guia: informação
 * clínica é sóbria, e uma cor por área sugeriria uma diferença que não existe.
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
    <Card onClick={() => navigate('/chat')} elevation="raised" padding="md" className="w-full text-left">
      {/* O título e a frase com o vão de 4 px dos outros cards da Início. A
          seta fica na linha do título: o `-my-px` centra os 24 px na linha de
          22 px do `text-card-title`. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-card-title font-bold text-foreground">Sua equipe está com você</p>
          <p className="text-body-sm text-muted-foreground">
            Quando precisar de algo, a gente está a um chat de distância.
          </p>
        </div>
        <ChevronRight size={24} strokeWidth={2} aria-hidden="true" className="-my-px shrink-0 text-primary-deep" />
      </div>

      {/* As bolhas vão num grupo só, e o vão de 12 px fica entre o grupo e a
          legenda. Quando ela não cabe ao lado das bolhas, desce para a linha
          de baixo rente à borda do card, e não recuada pelo vão. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex">
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
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-card bg-secondary text-primary-deep"
                // Empilhamento: deslocamento e camada dependem da posição de
                // cada especialidade na lista carregada da API — não há classe
                // estática que expresse isso.
                style={{ marginLeft: index > 0 ? '-8px' : 0, zIndex: specialties.length - index }}
                title={especialidade.label}
              >
                {/* 24 px, o mínimo do guia para ícone sem texto ao lado; cabe nos
                    36 px de dentro da bolha. */}
                <Icon size={24} strokeWidth={2} aria-hidden="true" />
              </span>
            );
          })}
        </div>
        <span className="min-w-0 text-caption font-medium text-muted-foreground">
          {total === 1 ? '1 especialidade cuidando de você' : `${total} especialidades cuidando de você`}
        </span>
      </div>
    </Card>
  );
}
