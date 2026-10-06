import * as React from 'react';
import { useId } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

type IconComponent = React.ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>;

type InputSurface = 'default' | 'pill';

// `pill`: cápsula branca com a sombra dos cards (busca da Central de
// Conhecimento). Só o desenho muda; o campo funciona igual, e o foco é o mesmo
// dos outros campos: borda escura e o anel laranja do app.
const surfaceVariants = cva('', {
  variants: {
    surface: {
      default: '',
      pill: 'h-[52px] rounded-full border-border shadow-sm focus:border-primary-deep',
    },
    withIcon: { true: '', false: '' },
  },
  compoundVariants: [{ surface: 'pill', withIcon: true, className: 'pl-14' }],
  defaultVariants: { surface: 'default', withIcon: false },
});

const iconVariants = cva('pointer-events-none absolute flex', {
  variants: {
    surface: {
      default: 'left-3 text-muted-foreground',
      pill: 'left-[18px] text-primary-deep',
    },
  },
  defaultVariants: { surface: 'default' },
});

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  iconLeft?: IconComponent;
  rightSlot?: React.ReactNode;
  /**
   * Nó opcional à direita do rótulo (ex.: "Esqueci minha senha").
   *
   * Existe para que uma tela que precise de uma ação na linha do label não
   * remonte o par label/campo à mão — foi assim que o Login acabou com 8px
   * entre rótulo e campo enquanto todo o resto do app usa 4px.
   */
  labelAction?: React.ReactNode;
  /**
   * Classes do próprio `<input>` (`className` vai para o contêiner). Serve ao
   * campo que precisa de outra escala — o código do SMS, grande e centralizado.
   */
  inputClassName?: string;
  /** Desenho do campo: o padrão, ou a cápsula da busca da Central de Conhecimento. */
  surface?: InputSurface;
  /**
   * Chega ao `<input>` nativo — o RHF a usa para focar o campo com erro (no
   * React 19 a `ref` é prop comum, sem `forwardRef`).
   */
  ref?: React.Ref<HTMLInputElement>;
}

export default function Input({
  label,
  id,
  type = 'text',
  error,
  helperText,
  iconLeft: IconLeft,
  rightSlot,
  labelAction,
  required = false,
  className,
  inputClassName,
  surface = 'default',
  ref,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const describedBy = error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined;

  return (
    <div className={cn('flex w-full flex-col gap-1', className)}>
      {label && (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={inputId} className="text-label font-semibold text-foreground">
            {label}
            {required && <span className="ml-0.5 text-destructive">*</span>}
          </label>
          {labelAction}
        </div>
      )}
      <div className="relative flex items-center">
        {IconLeft && (
          <span className={iconVariants({ surface })}>
            <IconLeft size={24} strokeWidth={2} aria-hidden />
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn(
            // Campo do guia da clínica: cantos de 8 px, texto `text-body` (16 px,
            // o piso que evita o zoom do iPhone); no foco, a borda escurece e o
            // anel laranja do app (`:focus-visible`) aparece.
            'h-12 w-full rounded-sm border border-input bg-card px-4 text-body text-foreground transition-[border-color,box-shadow] duration-150 ease-[ease,ease] placeholder:text-muted-foreground focus:border-primary-deep disabled:cursor-not-allowed disabled:opacity-60',
            IconLeft && 'pl-12',
            // O botão do fim (olho da senha, calendário) tem 48 px.
            rightSlot && 'pr-12',
            surfaceVariants({ surface, withIcon: Boolean(IconLeft) }),
            error && 'border-destructive focus:border-destructive',
            inputClassName
          )}
          {...rest}
        />
        {rightSlot && <span className="absolute right-0 flex items-center">{rightSlot}</span>}
      </div>
      {error && (
        <span id={`${inputId}-error`} className="text-caption font-medium text-destructive">
          {error}
        </span>
      )}
      {!error && helperText && (
        <span id={`${inputId}-helper`} className="text-caption font-medium text-muted-foreground">
          {helperText}
        </span>
      )}
    </div>
  );
}
