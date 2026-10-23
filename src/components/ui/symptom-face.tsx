import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { ALERT_THRESHOLD } from '../../utils/symptoms';

/**
 * A boca de cada carinha da escala 0–10: do sorriso largo ao choro com
 * sobrancelhas franzidas. Os graus pares são as seis do guia da clínica
 * ("EscalaSintomas"); os ímpares ficam no meio do caminho entre os vizinhos.
 * O círculo e os olhos são iguais em todas.
 */
const MOUTHS = [
  'M10.5 19c3 3.5 8 3.5 11 0',
  'M10.75 19.5c2.75 2.75 7.75 2.75 10.5 0',
  'M11 20c2.5 2 7.5 2 10 0',
  'M11 20.5c2.5 1 7.5 1 10 0',
  'M11 21h10',
  'M11 21.5c2.5-1 7.5-1 10 0',
  'M11 22c2.5-2 7.5-2 10 0',
  'M10.75 22.5c2.75-2.75 7.75-2.75 10.5 0',
  'M10.5 23c3-3.5 8-3.5 11 0',
  'M10.25 23.25c3-4 8.5-4 11.5 0M9.5 10.5l3.5 1M22.5 10.5l-3.5 1',
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
  /** Intensidade de 0 a 10 (valores fora da faixa são aparados). */
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
