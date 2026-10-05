import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { BRAND_S_PATH, BRAND_S_VIEWBOX } from './brand-pattern';

const brandMarkVariants = cva('inline-flex shrink-0 items-center justify-center rounded-full', {
  variants: {
    size: {
      sm: 'h-6 w-6',
      md: 'h-10 w-10',
      lg: 'h-14 w-14',
    },
    tone: {
      /** Círculo no verde da marca com o "S" branco — sobre fundo claro. */
      brand: 'bg-primary text-[var(--color-on-brand-cover)]',
      /** Círculo branco com o "S" no verde da marca — sobre a barra verde. */
      inverse: 'bg-[var(--color-on-brand-cover)] text-primary',
    },
  },
  defaultVariants: { size: 'md', tone: 'brand' },
});

export interface BrandMarkProps extends VariantProps<typeof brandMarkVariants> {
  className?: string;
}

/**
 * O "S" da Supera num círculo — o selo da equipe (ex.: quem responde no
 * Chat). É a redução da marca, cheia, com o vetor original do pacote de
 * design (o mesmo traçado da padronagem). Decorativo: quem usa diz em texto
 * quem é a equipe.
 */
export default function BrandMark({ size, tone, className }: BrandMarkProps) {
  return (
    <span aria-hidden="true" className={cn(brandMarkVariants({ size, tone }), className)}>
      <svg viewBox={BRAND_S_VIEWBOX} className="h-[56%] w-[56%] translate-x-[4%]" focusable="false">
        <path d={BRAND_S_PATH} fill="currentColor" />
      </svg>
    </span>
  );
}
