import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { NPS_SCORE_FACES, npsCategory } from '../../utils/nps';
import type { NpsScore } from '../../types';

// A escala do NPS em carinhas: cada nota de 0 a 10 é um botão com a carinha e
// o número. Escolher uma nota destaca aquela carinha na cor da faixa (detrator,
// neutro, promotor) e apaga um pouco as outras, para a escolha ficar óbvia de
// relance.

const faceVariants = cva(
  'flex min-h-[64px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border bg-card px-1 py-2 transition-[background-color,border-color,opacity,scale,filter] duration-150 ease-[ease] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)] motion-reduce:transition-none',
  {
    variants: {
      state: {
        // Nada escolhido ainda: todas com cor, convidando ao toque.
        idle: 'border-border hover:border-[color-mix(in_srgb,var(--color-primary)_40%,transparent)]',
        // Outra nota foi escolhida: esta recua.
        dimmed: 'border-border opacity-55 grayscale-[40%] hover:opacity-90 hover:grayscale-0',
        selected: 'scale-105 motion-reduce:scale-100',
      },
      category: {
        detractor: '',
        passive: '',
        promoter: '',
      },
    },
    compoundVariants: [
      {
        state: 'selected',
        category: 'detractor',
        className: 'border-destructive bg-[color-mix(in_srgb,var(--color-destructive)_12%,var(--color-card))]',
      },
      {
        state: 'selected',
        category: 'passive',
        className: 'border-[var(--color-mood-3)] bg-[color-mix(in_srgb,var(--color-mood-3)_16%,var(--color-card))]',
      },
      {
        state: 'selected',
        category: 'promoter',
        className:
          'border-[var(--color-supera-empatia)] bg-[color-mix(in_srgb,var(--color-supera-empatia)_14%,var(--color-card))]',
      },
    ],
    defaultVariants: { state: 'idle', category: 'passive' },
  }
);

interface NpsScoreScaleProps {
  value: NpsScore | undefined;
  onChange: (score: NpsScore) => void;
  /** `id` do título da pergunta, que dá nome ao grupo para o leitor de tela. */
  labelledBy?: string;
}

export default function NpsScoreScale({ value, onChange, labelledBy }: NpsScoreScaleProps) {
  const selected = value === undefined ? null : (NPS_SCORE_FACES.find((face) => face.score === value) ?? null);

  return (
    <div className="flex flex-col gap-2">
      {/* Quatro colunas abaixo de 360 px, seis acima: é o que mantém cada
          carinha com pelo menos 44 px de largura, o alvo de toque mínimo. */}
      <div
        role="group"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : 'Nota de 0 a 10'}
        className="grid grid-cols-4 gap-2 min-[360px]:grid-cols-6"
      >
        {NPS_SCORE_FACES.map(({ score, image, label }) => {
          const state = value === undefined ? 'idle' : value === score ? 'selected' : 'dimmed';

          return (
            <button
              key={score}
              type="button"
              aria-pressed={value === score}
              aria-label={`Nota ${score}: ${label}`}
              onClick={() => onChange(score)}
              className={cn(faceVariants({ state, category: npsCategory(score) }))}
            >
              {/* O leitor de tela já ouve "Nota 9: Recomendaria com certeza" —
                  a imagem por cima seria ruído. */}
              <img
                src={image}
                alt=""
                aria-hidden="true"
                width={160}
                height={160}
                draggable={false}
                className="size-8 select-none"
              />
              <span aria-hidden="true" className="text-[12px] font-semibold text-foreground">
                {score}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between text-[10px] font-normal tracking-wider text-muted-foreground uppercase">
        <span>Não recomendaria</span>
        <span>Recomendaria muito</span>
      </div>

      {/* O que a nota escolhida quer dizer, em palavras — e anunciado. A
          carinha fica de fora do anúncio pelo mesmo motivo dos botões. */}
      <p
        aria-live="polite"
        className="flex min-h-[24px] items-center justify-center gap-1.5 text-center text-[13px] font-medium text-foreground"
      >
        {selected && (
          <>
            <img
              src={selected.image}
              alt=""
              aria-hidden="true"
              width={160}
              height={160}
              draggable={false}
              className="size-5 select-none"
            />
            {`Nota ${selected.score} · ${selected.label}`}
          </>
        )}
      </p>
    </div>
  );
}
