import { useNavigate } from 'react-router';
import { ChevronRight, Heart } from 'lucide-react';
import Card from '../../components/ui/card';
import Badge from '../../components/ui/badge';
import Button from '../../components/ui/button';
import { getMoodInfo } from '../../utils/mood';
import type { DiaryEntry } from '../../types';

interface DiarySummaryCardProps {
  registro: DiaryEntry | null;
  sequenciaDias?: number;
}

export default function DiarySummaryCard({ registro, sequenciaDias = 0 }: DiarySummaryCardProps) {
  const navigate = useNavigate();

  if (!registro) {
    return (
      <Card padding="md">
        <h3 className="text-[16px] font-semibold text-foreground">Como você está hoje?</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Registrar como você está ajuda sua equipe a te acompanhar melhor.
        </p>
        <Button fullWidth size="sm" className="mt-3" onClick={() => navigate('/diario')}>
          Fazer registro de hoje
        </Button>
      </Card>
    );
  }

  const { label, icon: MoodIcon, colorVar } = getMoodInfo(registro.grau);
  const primeiroSintoma = registro.sintomas[0];

  return (
    <Card padding="md" onClick={() => navigate(`/diario/${registro.id}`)}>
      <div className="flex items-start gap-4">
        <span
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full"
          // Cor do humor vem de uma tabela (grau -> cor) resolvida em tempo
          // de execução — sem classe Tailwind estática que a expresse.
          style={{
            backgroundColor: `color-mix(in srgb, ${colorVar} 15%, transparent)`,
            boxShadow: `0 0 0 2px color-mix(in srgb, ${colorVar} 40%, transparent)`,
            color: colorVar,
          }}
          aria-label={`Grau ${registro.grau} — ${label}`}
        >
          <MoodIcon size={24} strokeWidth={2} aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-semibold tracking-[-0.4px] text-foreground">
            Você registrou hoje: <span style={{ color: colorVar }}>{label}</span>
          </h3>

          {registro.texto && (
            <p className="mt-1 line-clamp-2 text-[14px] text-muted-foreground">
              {registro.texto}
            </p>
          )}

          {primeiroSintoma && (
            <div className="mt-2 flex flex-wrap gap-1">
              <Badge tone="secondary" size="sm">
                {primeiroSintoma.nome} · {primeiroSintoma.intensidade}
              </Badge>
            </div>
          )}

          <div className="mt-3 flex items-center gap-1 text-[14px] font-medium text-[var(--color-supera-empatia)]">
            Ver detalhes
            <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
          </div>
        </div>
      </div>

      {sequenciaDias > 1 && (
        <div className="mt-4 flex items-center gap-2 border-t border-[color-mix(in_srgb,var(--color-supera-empatia)_15%,transparent)] pt-3">
          <Heart
            size={14}
            strokeWidth={2.5}
            fill="currentColor"
            aria-hidden="true"
            className="flex-shrink-0 text-[var(--color-supera-empatia)]"
          />
          <p className="text-[11px] text-muted-foreground">
            <strong className="text-foreground">{sequenciaDias} dias seguidos</strong> registrando.
            Sua equipe agradece por compartilhar.
          </p>
        </div>
      )}
    </Card>
  );
}
