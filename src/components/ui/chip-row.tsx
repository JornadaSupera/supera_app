import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Fileira de chips (`Tag`) que rola na horizontal: os filtros do Diário, da
// Agenda, das Orientações e da Central de Notificações.
//
// O chip (40px) amplia a área de toque 4px acima e abaixo do desenho, até os
// 48px do guia, mas a rolagem corta o que passa da borda da fileira, e o
// toque útil ficava só com o desenho. Em tela de toque, a fileira ganha 11px
// de respiro em cima e embaixo (folga para a faixa de toque inteira), e a
// margem negativa devolve o mesmo espaço: nada se move na tela. Com mouse fica
// como era, porque lá não falta área de toque, e o respiro empurraria a barra
// de rolagem, que só aparece no computador.

const chipRowVariants = cva(
  'flex flex-nowrap gap-2 overflow-x-auto pointer-coarse:pt-[11px] pointer-coarse:-mb-[11px]',
  {
    variants: {
      /** O espaço acima da fileira, o mesmo que a tela já usava. */
      offset: {
        none: 'pointer-coarse:-mt-[11px]',
        sm: 'mt-3 pointer-coarse:mt-px',
        md: 'mt-4 pointer-coarse:mt-[5px]',
      },
      /** O respiro abaixo dos chips, o mesmo que a tela já usava. */
      bottom: {
        xs: 'pb-[2px] pointer-coarse:pb-[13px]',
        sm: 'pb-1 pointer-coarse:pb-[15px]',
      },
    },
    defaultVariants: { offset: 'none', bottom: 'sm' },
  }
);

export interface ChipRowProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof chipRowVariants> {}

export default function ChipRow({ offset, bottom, className, ...rest }: ChipRowProps) {
  return <div className={cn(chipRowVariants({ offset, bottom }), className)} {...rest} />;
}
