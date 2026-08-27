import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const iconHeadingVariants = cva('flex flex-col', {
  variants: {
    align: {
      left: 'items-start text-left',
      center: 'items-center text-center',
    },
    size: {
      md: '',
      lg: '',
    },
  },
  defaultVariants: { align: 'left', size: 'md' },
});

export interface IconHeadingProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof iconHeadingVariants> {
  icon?: LucideIcon;
  /** Cor do ícone e do fundo da bolha. Aceita token ou qualquer cor CSS. */
  iconTone?: string;
  title?: string;
  description?: string;
  /** Bolha e ícone menores, para usos mais discretos. */
  compact?: boolean;
}

export default function IconHeading({
  icon: Icon,
  iconTone = 'var(--color-primary)',
  title,
  description,
  align,
  size,
  compact = false,
  className,
  style,
  ...rest
}: IconHeadingProps) {
  const isLarge = size === 'lg';
  const isCentered = align === 'center';

  return (
    <div
      className={cn(iconHeadingVariants({ align, size }), className)}
      // A cor varia por instância (por isso custom property inline): nenhuma
      // classe estática do Tailwind a expressa.
      style={{ ...style, '--icon-tone': iconTone } as React.CSSProperties}
      {...rest}
    >
      {Icon && (
        <div
          className={cn(
            'inline-flex w-fit items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--icon-tone)_14%,transparent)]',
            compact ? 'p-4' : 'p-6',
            isLarge ? 'mb-8' : 'mb-6',
            isCentered && 'mx-auto'
          )}
        >
          <Icon
            size={compact ? 28 : 48}
            strokeWidth={compact ? 1.75 : 1.5}
            className="text-[var(--icon-tone)]"
            aria-hidden="true"
          />
        </div>
      )}

      <h1
        className={cn(
          'font-semibold tracking-[-0.4px] whitespace-pre-line',
          isLarge ? 'text-[24px]/[1.3]' : 'text-[20px]/[1.3]'
        )}
      >
        {title}
      </h1>

      {description && (
        <p
          className={cn(
            'mt-[6px] text-[14px]/[1.6] text-muted-foreground',
            isCentered && 'mx-auto max-w-[280px]'
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}
