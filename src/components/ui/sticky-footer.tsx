import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Barra de ação presa no rodapé da tela.
//
// Esta string de classes estava copiada, idêntica, em 12 lugares de 8 arquivos
// — e o custo disso apareceu ao tratar o recorte do aparelho: somar o
// `--safe-bottom` foi uma edição em cada cópia, com 12 chances de esquecer uma.
// Agora é um lugar só.
//
// O que NÃO virou prop: `z-index`, `shrink-0`, `flex`/`gap` e alinhamento. São
// ajustes de contexto (a barra do chat vive num flex de altura fixa, a de
// recuperação empilha dois botões), não decisões de aparência da barra. Vão
// pelo `className`, que o `cn()` mescla — prop para cada um deles seria
// inventar vocabulário para o que o Tailwind já expressa.

const stickyFooterVariants = cva(
  // `pb-` depois de `py-` de propósito: o tailwind-merge sabe que os dois
  // disputam a borda de baixo e deixa o último vencer, que é como o recorte do
  // indicador de início entra sem desmontar o espaçamento vertical.
  'sticky bottom-0 border-t border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] backdrop-blur-[8px]',
  {
    variants: {
      density: {
        /** Telas de formulário e onboarding: um botão largo, respiro maior. */
        default: 'px-6 py-4 pb-[calc(1rem_+_var(--safe-bottom))]',
        /** Conversa: o campo de digitação precisa da tela, não da moldura. */
        compact: 'px-4 py-3 pb-[calc(0.75rem_+_var(--safe-bottom))]',
      },
    },
    defaultVariants: { density: 'default' },
  }
);

export interface StickyFooterProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof stickyFooterVariants> {}

export default function StickyFooter({ density, className, ...rest }: StickyFooterProps) {
  return <footer className={cn(stickyFooterVariants({ density }), className)} {...rest} />;
}
