import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { getIntensityInfo } from '../../utils/symptoms';

const intensityEmojiVariants = cva('shrink-0 select-none', {
  variants: {
    size: {
      /** Linha de sintoma. */
      sm: 'size-10',
      /** Cartão de resumo (Início). */
      md: 'size-13',
      /** Destaque do registro. */
      lg: 'size-20',
    },
  },
  defaultVariants: { size: 'md' },
});

export interface IntensityEmojiProps extends VariantProps<typeof intensityEmojiVariants> {
  /** Intensidade de 0 a 5 (valores fora da faixa são aparados). */
  grade: number;
  className?: string;
}

/**
 * O emoji 3D de uma intensidade de sintoma (`INTENSITY_LEVELS`). Decorativo:
 * quem lê o sentido é o rótulo ao lado ("Forte", "Insuportável"), então o
 * leitor de tela não o anuncia.
 */
export default function IntensityEmoji({ grade, size, className }: IntensityEmojiProps) {
  const { emoji } = getIntensityInfo(grade);

  return (
    <img
      src={emoji}
      alt=""
      aria-hidden="true"
      width={160}
      height={160}
      draggable={false}
      className={cn(intensityEmojiVariants({ size }), className)}
    />
  );
}
