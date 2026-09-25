import type { ComponentType } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// A pastilha de ícone das telas com a capa da marca (Início, Central de
// Conhecimento).
// `brand`: degradê do verde da marca com o ícone em branco.
// `alert`: o mesmo desenho em vermelho (sinais de alerta).
// `cover`: branco translúcido, para ficar sobre a própria capa verde.
const iconTileVariants = cva('inline-flex shrink-0 items-center justify-center', {
  variants: {
    tone: {
      brand:
        'bg-[linear-gradient(145deg,var(--color-primary),var(--color-brand-cover))] text-[var(--color-on-brand-cover)] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-on-brand-cover)_28%,transparent),0_8px_16px_-10px_var(--color-brand-cover)]',
      alert:
        'bg-[linear-gradient(145deg,color-mix(in_srgb,var(--color-destructive)_82%,var(--color-on-brand-cover)),var(--color-destructive))] text-[var(--color-on-brand-cover)] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-on-brand-cover)_28%,transparent),0_8px_16px_-10px_var(--color-destructive)]',
      cover:
        'bg-[var(--color-brand-cover-deep)] text-[var(--color-on-brand-cover)] ring-1 ring-[color-mix(in_srgb,var(--color-on-brand-cover)_22%,transparent)] ring-inset',
    },
    size: {
      sm: 'size-10 rounded-[13px] [&>svg]:size-5',
      md: 'size-12 rounded-[16px] [&>svg]:size-6',
      lg: 'size-14 rounded-[18px] [&>svg]:size-7',
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
