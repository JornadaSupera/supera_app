import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/** Tinta da etiqueta solta (sem `onClick`). O filtro tem as cores fixas do guia. */
export type TagTone = 'default' | 'alert' | 'neutral' | 'attention';

export interface TagProps extends React.HTMLAttributes<HTMLElement> {
  selected?: boolean;
  /**
   * Cor da etiqueta solta: `default` é a de especialidade do guia
   * (verde-água claro, texto verde escuro); `alert`, o aviso em vermelho;
   * `neutral`, a cinza; `attention`, a laranja clara dos lembretes e avisos
   * de atenção (`orange-soft` com `orange-deep`). Não vale para o filtro.
   */
  tone?: TagTone;
  onClick?: () => void;
}

// As duas formas do guia da clínica.
const tagVariants = cva('inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full', {
  variants: {
    kind: {
      // Etiqueta de categoria (a de especialidade do "CardOrientacao"): texto
      // de 13 px em seminegrito sobre uma tinta clara (ver `tone`).
      label: 'px-3 py-0.5 text-caption font-semibold',
      // Filtro ("ChipEspecialidade"): pílula de 40 px com borda de 1,5 px,
      // neutra quando solta. A faixa invisível leva o toque a 48 px.
      filter:
        "relative min-h-10 cursor-pointer border-[1.5px] border-border bg-card px-4 text-label font-semibold text-muted-foreground transition-[background-color,border-color,color] duration-150 ease-[ease] before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
    },
    // Selecionado: fundo verde-água claro, borda e texto no verde escuro.
    selected: {
      true: 'border-primary-deep bg-secondary text-primary-deep',
      false: '',
    },
    tone: { default: '', alert: '', neutral: '', attention: '' },
  },
  compoundVariants: [
    { kind: 'label', tone: 'default', className: 'bg-secondary text-primary-deep' },
    { kind: 'label', tone: 'alert', className: 'bg-destructive-soft text-destructive-deep' },
    // A cinza leva o fio `line` por dentro: no tema escuro o `muted` é a
    // própria cor do cartão, e a pílula sumia, deixando só o texto recuado
    // (o guia: "no escuro, preferir borda `line`"). No claro ele quase não
    // aparece, e a altura não muda.
    {
      kind: 'label',
      tone: 'neutral',
      className: 'bg-muted text-muted-foreground ring-1 ring-border ring-inset',
    },
    { kind: 'label', tone: 'attention', className: 'bg-orange-soft text-orange-deep' },
  ],
  defaultVariants: { kind: 'label', selected: false, tone: 'default' },
});

export default function Tag({
  children,
  selected = false,
  tone = 'default',
  onClick,
  className,
  ...rest
}: TagProps) {
  const selectable = Boolean(onClick);
  const Element = (selectable ? 'button' : 'span') as React.ElementType;

  return (
    <Element
      type={selectable ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={selectable ? selected : undefined}
      className={cn(
        tagVariants({ kind: selectable ? 'filter' : 'label', selected: selectable && selected, tone }),
        className
      )}
      {...rest}
    >
      {children}
    </Element>
  );
}
