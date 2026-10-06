import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Os dois títulos de seção do guia da clínica ("TituloSecao"), vindos dos
// impressos, e o traço verde que o app usava antes deles.
//
// `band` e `tab` encostam na borda esquerda da tela: o `-ml-4` desfaz a margem
// de 16 px das telas (como o `margin-left: -16px` do guia). Tela com outro
// recuo passa o seu (`-ml-5`, `-ml-6`) no `className`, que o `cn()` mescla.
const sectionHeadingVariants = cva('flex items-center justify-between gap-3', {
  variants: {
    variant: {
      /**
       * A faixa clara do Manual do Paciente: fundo `band`, arredondada à direita.
       * `min-h-12` com `py-0.5` dá os 48 px do guia (12 + a linha de 24 do
       * `text-section` + 12). Um link de 48 px à direita ("Ver todas") cabe sem a
       * faixa crescer se desfizer o `py-0.5` com `-my-0.5`.
       */
      band: '-ml-4 min-h-12 rounded-r-lg bg-band py-0.5 pr-4 pl-4',
      /** A aba do folheto do cateter: só o título, numa pílula `teal-deep`. */
      tab: '-ml-4',
      /** O traço verde ao lado do título, sem fundo. */
      plain: 'px-1',
    },
  },
  defaultVariants: { variant: 'band' },
});

const sectionTitleVariants = cva('text-section font-bold', {
  variants: {
    variant: {
      band: 'text-primary-deep',
      tab: 'rounded-r-full bg-primary-deep py-2 pr-6 pl-4 text-on-primary-deep',
      plain: 'text-primary-deep',
    },
  },
  defaultVariants: { variant: 'band' },
});

export interface SectionHeadingProps extends VariantProps<typeof sectionHeadingVariants> {
  id?: string;
  children: ReactNode;
  /** O que vai à direita do título (ex.: "Ver todas"). Na aba, fica fora da pílula. */
  action?: ReactNode;
  className?: string;
}

/**
 * Título de seção em frase normal (sem caixa alta), `text-section` (18/24) em
 * negrito. É um `<h2>`. A faixa (`band`) é o padrão; a aba (`tab`) é para o
 * título principal de um tema.
 */
export default function SectionHeading({ id, children, action, variant, className }: SectionHeadingProps) {
  return (
    <div className={cn(sectionHeadingVariants({ variant }), className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {variant === 'plain' && <span aria-hidden="true" className="h-4 w-1 shrink-0 rounded-full bg-primary" />}
        <h2 id={id} className={sectionTitleVariants({ variant })}>
          {children}
        </h2>
      </div>
      {action}
    </div>
  );
}
