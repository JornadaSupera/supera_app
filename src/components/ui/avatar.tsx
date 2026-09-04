import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const avatarVariants = cva(
  'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-secondary font-semibold text-secondary-foreground',
  {
    variants: {
      size: {
        sm: 'h-6 w-6 text-[10px]',
        md: 'h-8 w-8 text-[12px]',
        lg: 'h-10 w-10 text-[14px]',
        xl: 'h-14 w-14 text-[18px]',
      },
      ring: {
        // Cor do anel é uma custom property com fallback (`--avatar-ring-color`,
        // igual ao CSS original) para que uma tela consumidora possa
        // sobrescrevê-la em cascata (ex.: ProfileHub já faz isso hoje via
        // `style={{ '--avatar-ring-color': ... }}` no componente antigo).
        // Como os dois lados do `var()` são tokens estáticos, isso não
        // precisa de `style` inline aqui — vira uma classe fixa.
        true: 'shadow-[0_0_0_2px_var(--avatar-ring-color,var(--color-card))]',
      },
    },
    defaultVariants: { size: 'md' },
  }
);

function getInitials(name: string = ''): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface AvatarProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof avatarVariants> {
  /**
   * Aceita `null` de propósito: nenhuma fonte de foto deste app tem coluna
   * de imagem hoje (nome de profissional nem sequer é legível pelo paciente,
   * ver `types/messages.ts`), então todo chamador passa `null`. Exigir
   * `string | undefined` obrigaria cada um a converter, sem ganho.
   * Qualquer valor ausente cai no fallback de iniciais.
   */
  src?: string | null;
  alt?: string;
  name?: string;
}

export default function Avatar({
  src,
  alt = '',
  name,
  size,
  ring = false,
  className,
  ...rest
}: AvatarProps) {
  return (
    <span className={cn(avatarVariants({ size, ring }), className)} {...rest}>
      {src ? (
        <img className="h-full w-full object-cover" src={src} alt={alt || name || ''} />
      ) : (
        <span aria-hidden="true">{getInitials(name)}</span>
      )}
    </span>
  );
}
