import * as React from 'react';
import { ArrowLeft, ChevronLeft } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const headerVariants = cva('flex items-center gap-3 bg-background', {
  variants: {
    variant: {
      page: 'p-4',
      // Variante compacta, usada nos fluxos por etapas (onboarding).
      step: 'px-6 pt-6 pb-3',
    },
    sticky: { true: 'sticky top-0 z-20' },
    bordered: { true: 'border-b border-border' },
    blurred: {
      true: 'bg-[color-mix(in_srgb,var(--color-background)_95%,transparent)] backdrop-blur-[8px]',
    },
  },
  defaultVariants: { variant: 'page' },
});

const backButtonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center border-none bg-transparent text-foreground transition-colors duration-150 ease-[ease] hover:bg-muted',
  {
    variants: {
      variant: {
        // 44px nas duas variantes: o alvo mínimo de toque não muda porque o
        // cabeçalho é de página ou de etapa. Só o ícone difere (seta x chevron).
        page: 'h-11 w-11 rounded-full',
        step: 'h-11 w-11 rounded-full',
      },
    },
    defaultVariants: { variant: 'page' },
  }
);

export interface HeaderProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'title'>,
    VariantProps<typeof headerVariants> {
  title?: string;
  subtitle?: string;
  /** Texto curto da variante `step` (ex.: "Etapa 2 de 4"). */
  meta?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
}

export default function Header({
  variant,
  title,
  subtitle,
  meta,
  onBack,
  actions,
  sticky = false,
  bordered = false,
  blurred = false,
  className,
  ...rest
}: HeaderProps) {
  const isStep = variant === 'step';
  const BackIcon = isStep ? ChevronLeft : ArrowLeft;

  return (
    <header
      className={cn(headerVariants({ variant, sticky, bordered, blurred }), className)}
      {...rest}
    >
      {onBack && (
        <button
          type="button"
          className={backButtonVariants({ variant })}
          onClick={onBack}
          aria-label="Voltar"
        >
          <BackIcon size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      )}

      {isStep ? (
        meta && <p className="text-[12px] font-medium text-muted-foreground">{meta}</p>
      ) : (
        <div className="min-w-0 flex-1">
          <h1 className="overflow-hidden text-[24px]/[32px] font-semibold tracking-[-0.6px] text-ellipsis whitespace-nowrap text-foreground">
            {title}
          </h1>
          {subtitle && <p className="text-[14px]/[20px] text-muted-foreground">{subtitle}</p>}
        </div>
      )}

      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
