import type { ComponentType } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// A pastilha de ícone das telas com a capa da marca (hoje, o selo do tema na
// capa da Central de Conhecimento). O guia da clínica pede ícone de traço, sem
// preenchimento colorido decorativo: a pastilha é um fundo liso, sem degradê
// nem sombra, com o ícone de 24 px no mínimo.
// `brand`: fundo `surface-teal` com o ícone em `teal-deep`.
// `alert`: fundo `alert-soft` com o ícone em `alert` (sinais de alerta).
// `cover`: verde escuro com contorno claro, para ficar sobre a própria capa verde.
const iconTileVariants = cva('inline-flex shrink-0 items-center justify-center', {
  variants: {
    tone: {
      brand: 'bg-secondary text-primary-deep',
      alert: 'bg-destructive-soft text-destructive',
      cover:
        'bg-[var(--color-brand-cover-deep)] text-[var(--color-on-brand-cover)] ring-1 ring-[color-mix(in_srgb,var(--color-on-brand-cover)_22%,transparent)] ring-inset',
    },
    size: {
      sm: 'size-10 rounded-lg [&>svg]:size-6',
      md: 'size-12 rounded-lg [&>svg]:size-6',
      lg: 'size-14 rounded-lg [&>svg]:size-7',
    },
  },
  defaultVariants: { tone: 'brand', size: 'md' },
});

export interface IconTileProps extends VariantProps<typeof iconTileVariants> {
  /** Qualquer ícone que aceite `className` (os próprios do app ou os do Lucide). */
  icon: ComponentType<{ className?: string }>;
  className?: string;
}

/** O ícone numa pastilha. Decorativo: o nome do que ele representa vem escrito ao lado. */
export default function IconTile({ icon: Icon, tone, size, className }: IconTileProps) {
  return (
    <span aria-hidden="true" className={cn(iconTileVariants({ tone, size }), className)}>
      <Icon />
    </span>
  );
}
