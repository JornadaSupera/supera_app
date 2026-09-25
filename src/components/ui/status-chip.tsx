import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Situação do acompanhante ou do vínculo: uma pastilha com o texto na cor do
// corpo (legível) e uma bolinha na cor da situação. A cor sozinha não carrega o
// sentido — o texto diz — e o `Badge` do app pinta o texto com a própria cor da
// situação, que no âmbar e no verde-água não passa de 3:1 sobre o fundo claro.

const dotVariants = cva('h-2 w-2 shrink-0 rounded-full', {
  variants: {
    tone: {
      active: 'bg-primary',
      waiting: 'bg-[var(--color-infusion-prep)]',
      expired: 'bg-destructive',
      revoked: 'bg-muted-foreground',
    },
  },
});

export interface StatusChipProps extends VariantProps<typeof dotVariants> {
  children: ReactNode;
  className?: string;
}

export default function StatusChip({ tone, children, className }: StatusChipProps) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[12px] font-medium text-foreground',
        className
      )}
    >
      <span aria-hidden="true" className={dotVariants({ tone })} />
      {children}
    </span>
  );
}
