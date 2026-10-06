import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { ALERT_THRESHOLD } from '../../utils/symptoms';

/**
 * A boca de cada carinha da escala 0–5, copiada do guia da clínica
 * ("EscalaSintomas"): do sorriso largo ao choro com sobrancelhas franzidas.
 * O círculo e os olhos são iguais em todas.
 */
const MOUTHS = [
  'M10.5 19c3 3.5 8 3.5 11 0',
  'M11 20c2.5 2 7.5 2 10 0',
  'M11 21h10',
  'M11 22c2.5-2 7.5-2 10 0',
  'M10.5 23c3-3.5 8-3.5 11 0',
  'M10 23.5c3-4.5 9-4.5 12 0M9 10l4 1.5M23 10l-4 1.5',
] as const;

const symptomFaceVariants = cva('shrink-0', {
  variants: {
    size: {
      /** Dentro do botão da escala. */
      xs: 'size-[30px]',
      /** Linha de sintoma. */
      sm: 'size-10',
      /** Cartão de resumo (Início). */
      md: 'size-13',
      /** Destaque do registro. */
      lg: 'size-20',
    },
    /**
     * `current`: a cor de quem está em volta (o botão da escala). `grade`: o
     * verde escuro, ou o vermelho de alarme a partir do grau de alerta.
     */
    tone: {
      current: '',
      grade: '',
    },
  },
  defaultVariants: { size: 'md', tone: 'grade' },
});

export interface SymptomFaceProps extends VariantProps<typeof symptomFaceVariants> {
  /** Intensidade de 0 a 5 (valores fora da faixa são aparados). */
  grade: number;
  className?: string;
}

/**
 * A carinha de traço de uma intensidade de sintoma, como no guia da clínica —
 * no lugar do emoji, que o guia não usa nas telas clínicas. Decorativa: quem
 * diz o grau é o número ou o rótulo ao lado, então o leitor de tela não a
 * anuncia.
 */
export default function SymptomFace({ grade, size, tone, className }: SymptomFaceProps) {
  const level = Math.min(Math.max(Math.round(grade), 0), MOUTHS.length - 1);
  const toneClass =
    tone === 'current' ? '' : level >= ALERT_THRESHOLD ? 'text-destructive' : 'text-primary-deep';

  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className={cn(symptomFaceVariants({ size }), toneClass, className)}
    >
      <circle cx="16" cy="16" r="13" />
      <path d="M11.5 13v.01M20.5 13v.01" strokeWidth={3} />
      <path d={MOUTHS[level]} />
    </svg>
  );
}
