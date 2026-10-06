import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { NPS_SCORE_FACES } from '../../utils/nps';
import type { NpsScore } from '../../types';

// A escala do NPS em carinhas: cada nota de 0 a 10 é um botão com a carinha e
// o número. Escolher uma nota destaca aquela carinha e apaga um pouco as
// outras, para a escolha ficar óbvia de relance.
//
// O destaque é o selecionado da escala do guia da clínica (contorno de 2 px e
// número em `teal-deep`, fundo `surface-teal`), o mesmo para toda nota: o
// vermelho do guia é só de alerta, e a carinha já diz o sentimento.

const faceVariants = cva(
  'flex min-h-[64px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 bg-card px-1 py-2 transition-[background-color,border-color,opacity,scale,filter] duration-150 ease-[ease] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)] motion-reduce:transition-none',
  {
    variants: {
      state: {
        // Nada escolhido ainda: todas com cor, convidando ao toque.
        idle: 'border-border hover:border-[color-mix(in_srgb,var(--color-primary)_40%,transparent)]',
        // Outra nota foi escolhida: esta recua. Só até 75%: o número continua
        // em `ink` acima de 4,5:1 sobre o branco — o botão segue ativo.
        dimmed: 'border-border opacity-75 grayscale-[40%] hover:opacity-90 hover:grayscale-0',
        selected: 'scale-105 border-primary-deep bg-secondary motion-reduce:scale-100',
      },
    },
    defaultVariants: { state: 'idle' },
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
          carinha com pelo menos 48 px de largura, o alvo de toque do guia. */}
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
              className={cn(faceVariants({ state }))}
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
              <span
                aria-hidden="true"
                className={cn(
                  'text-label font-semibold',
                  state === 'selected' ? 'text-primary-deep' : 'text-foreground'
                )}
              >
                {score}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between text-caption font-medium text-muted-foreground">
        <span>Não recomendaria</span>
        <span>Recomendaria muito</span>
      </div>

      {/* O que a nota escolhida quer dizer, em palavras — e anunciado. A
          carinha fica de fora do anúncio pelo mesmo motivo dos botões. */}
      <p
        aria-live="polite"
        className="flex min-h-[24px] items-center justify-center gap-1.5 text-center text-label font-semibold text-foreground"
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
