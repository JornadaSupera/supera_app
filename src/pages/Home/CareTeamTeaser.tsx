import { useNavigate } from 'react-router';
import { ChevronRight } from 'lucide-react';
import Card from '../../components/ui/card';
import Avatar from '../../components/ui/avatar';
import type { CareTeamMember } from '../../types';

interface CareTeamTeaserProps {
  equipe?: CareTeamMember[];
  total?: number;
}

export default function CareTeamTeaser({ equipe = [], total = 0 }: CareTeamTeaserProps) {
  const navigate = useNavigate();

  return (
    <Card onClick={() => navigate('/chat')} padding="none" className="w-full p-4 text-left">
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
        {equipe.map((pessoa, index) => (
          <span
            key={`${pessoa.nome}-${index}`}
            className="inline-flex"
            // Empilhamento de avatares: deslocamento e camada dependem da
            // posição de cada pessoa na lista carregada da API — não há
            // classe estática que expresse isso.
            style={{ marginLeft: index > 0 ? '-6px' : 0, zIndex: equipe.length - index }}
          >
            <Avatar src={pessoa.foto} name={pessoa.nome} size="md" ring />
          </span>
        ))}
        <span className="ml-3 text-[11px] text-muted-foreground">
          {total} profissionais cuidando de você
        </span>
      </div>
    </Card>
  );
}
