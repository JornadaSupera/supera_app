import { cva } from 'class-variance-authority';
import { ALERT_THRESHOLD, getIntensityInfo } from '../../utils/symptoms';
import { cn } from '@/lib/utils';
import SymptomFace from './symptom-face';

const NOTAS = [0, 1, 2, 3, 4, 5];

export interface SymptomScaleProps {
  /** Identifica o grupo de opções — um por sintoma. */
  id: string;
  nome: string;
  descricao?: string;
  /** Intensidade de 0 a 5. */
  value?: number;
  onChange: (value: number) => void;
  className?: string;
}

// Cada grau, como no guia da clínica ("EscalaSintomas"): carinha de traço e
// número sempre visível. Escolhido, fica no verde (borda e tinta clara); nos
// graus de alerta, no vermelho de alarme — o grau é dito pelo número, pela
// carinha e pela cor, nunca só pela cor.
const gradeOptionVariants = cva(
  'flex min-h-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 text-label font-semibold transition-[background-color,border-color,color] duration-150 ease-[ease] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-ring)]',
  {
    variants: {
      state: {
        idle: 'border-border bg-card text-muted-foreground hover:border-[color-mix(in_srgb,var(--color-primary-deep)_35%,var(--color-border))]',
        selected: 'border-primary-deep bg-secondary text-primary-deep',
        alert: 'border-destructive bg-destructive-soft text-destructive-deep',
      },
    },
    defaultVariants: { state: 'idle' },
  }
);

/**
 * Escala 0–5 de um sintoma.
 *
 * Seis botões iguais, de 64 px de altura (o controle deslizante de antes tinha
 * o polegar de 20 px e, no iPhone, tocar na trilha muitas vezes não movia
 * nada). Por baixo são `input type="radio"` de verdade, escondidos: é o que dá
 * navegação por setas e anúncio correto no leitor de tela sem reimplementar
 * nada disso à mão.
 */
export default function SymptomScale({
  id,
  nome,
  descricao,
  value = 0,
  onChange,
  className,
}: SymptomScaleProps) {
  // Rótulo da escala 0–5 vem de `utils/symptoms`, fonte única.
  const intensidade = getIntensityInfo(value);

  return (
    <fieldset className={cn('flex flex-col gap-3 rounded-2xl bg-muted p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <legend className="float-left">
          <span className="block text-body font-semibold text-foreground">{nome}</span>
          {descricao && <span className="block text-caption font-medium text-muted-foreground">{descricao}</span>}
        </legend>
        <span className="shrink-0 text-body-sm/6 font-medium whitespace-nowrap text-muted-foreground">
          Grau {value} de 5 · {intensidade.label}
        </span>
      </div>

      <div className="grid grid-cols-6 gap-2">
        {NOTAS.map((nota) => {
          const selecionada = value === nota;
          const state = !selecionada ? 'idle' : nota >= ALERT_THRESHOLD ? 'alert' : 'selected';

          return (
            <label key={nota} className={gradeOptionVariants({ state })}>
              <input
                type="radio"
                name={`sintoma-${id}`}
                value={nota}
                checked={selecionada}
                onChange={() => onChange(nota)}
                aria-label={`Grau ${nota} — ${getIntensityInfo(nota).label}`}
                className="sr-only"
              />
              <SymptomFace grade={nota} size="xs" tone="current" />
              {nota}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
