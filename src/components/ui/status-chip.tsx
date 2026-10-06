import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Situação do acompanhante ou do vínculo: uma pastilha com o texto na cor do
// corpo (legível) e uma bolinha na cor da situação. A cor sozinha não carrega o
// sentido — o texto diz. Texto na cor da situação não serve: o laranja e o
// verde da marca não passam de 3:1 sobre o fundo claro.
//
// O fio `line` por dentro desenha a pastilha no tema escuro, onde o `muted` é
// a própria cor do cartão e ela sumia (o guia: "no escuro, preferir borda
// `line`"). No claro ele quase não aparece, e a altura não muda.

const dotVariants = cva('h-2 w-2 shrink-0 rounded-full', {
  variants: {
    tone: {
      active: 'bg-primary',
      // O laranja do guia, o dos marcadores.
      waiting: 'bg-orange',
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
        'inline-flex w-fit items-center gap-1.5 rounded-full bg-muted px-3 py-0.5 text-caption font-medium text-foreground ring-1 ring-border ring-inset',
        className
      )}
    >
      <span aria-hidden="true" className={dotVariants({ tone })} />
      {children}
    </span>
  );
}
