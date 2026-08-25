import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg border border-transparent font-semibold whitespace-nowrap cursor-pointer transition-[background-color,border-color,opacity,transform] duration-[0.15s,0.15s,0.15s,0.1s] ease-[ease,ease,ease,ease] [&:active:not(:disabled)]:translate-y-px disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-sm [&:hover:not(:disabled)]:brightness-[0.94]',
        secondary: 'bg-secondary text-secondary-foreground [&:hover:not(:disabled)]:brightness-[0.97]',
        outline: 'bg-transparent border-border text-foreground [&:hover:not(:disabled)]:bg-muted',
        ghost: 'bg-transparent text-foreground [&:hover:not(:disabled)]:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground [&:hover:not(:disabled)]:brightness-[0.94]',
        'destructive-soft':
          'bg-destructive/10 text-destructive [&:hover:not(:disabled)]:bg-destructive/20',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-5 text-base',
      },
      fullWidth: { true: 'w-full' },
      pill: { true: 'rounded-full' },
      iconOnly: { true: 'px-0' },
    },
    compoundVariants: [
      { iconOnly: true, size: 'sm', class: 'w-8' },
      { iconOnly: true, size: 'md', class: 'w-10' },
      { iconOnly: true, size: 'lg', class: 'w-12' },
    ],
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

type IconComponent = React.ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>;

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  fullWidth?: boolean;
  pill?: boolean;
  iconLeft?: IconComponent;
  iconRight?: IconComponent;
  loading?: boolean;
}

const ICON_SIZE_BY_SIZE: Record<string, number> = { sm: 16, md: 18, lg: 20 };

export default function Button({
  children,
  variant,
  size = 'md',
  fullWidth = false,
  pill = false,
  iconLeft: IconLeft,
  iconRight: IconRight,
  loading = false,
  disabled = false,
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  const iconOnly = !children && Boolean(IconLeft || IconRight);
  const iconSize = ICON_SIZE_BY_SIZE[size ?? 'md'];

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, fullWidth, pill, iconOnly }), className)}
      {...rest}
    >
      {loading ? (
        <Loader2 size={iconSize} className="animate-spin" aria-hidden="true" />
      ) : (
        <>
          {IconLeft && (
            <span className="inline-flex shrink-0">
              <IconLeft size={iconSize} strokeWidth={2} aria-hidden />
            </span>
          )}
          {children}
          {IconRight && (
            <span className="inline-flex shrink-0">
              <IconRight size={iconSize} strokeWidth={2} aria-hidden />
            </span>
          )}
        </>
      )}
    </button>
  );
}
