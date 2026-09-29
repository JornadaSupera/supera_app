import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { BRAND_S_PATH } from './brand-pattern';

const brandMarkVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-cover)] text-[var(--color-on-brand-cover)]',
  {
    variants: {
      size: {
        sm: 'h-6 w-6',
        md: 'h-10 w-10',
        lg: 'h-14 w-14',
      },
    },
    defaultVariants: { size: 'md' },
  }
);

export interface BrandMarkProps extends VariantProps<typeof brandMarkVariants> {
  className?: string;
}

/**
 * O "S" da Supera num círculo verde — o selo da equipe (ex.: quem responde no
 * Chat). O mesmo traçado da padronagem, em contorno branco. Decorativo: quem
 * usa diz em texto quem é a equipe.
 */
export default function BrandMark({ size, className }: BrandMarkProps) {
  return (
    <span aria-hidden="true" className={cn(brandMarkVariants({ size }), className)}>
      <svg viewBox="0 0 100 132" className="h-[62%] w-[62%]" focusable="false">
        <path
          d={BRAND_S_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth={7}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
