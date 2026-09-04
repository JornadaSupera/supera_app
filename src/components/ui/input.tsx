import * as React from 'react';
import { useId } from 'react';
import { cn } from '@/lib/utils';

type IconComponent = React.ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>;

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
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
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
    ...rest
  },
  ref
) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const describedBy = error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined;

  return (
    <div className={cn('flex w-full flex-col gap-1', className)}>
      {label && (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={inputId} className="text-[13px] font-medium text-foreground">
            {label}
            {required && <span className="ml-0.5 text-destructive">*</span>}
          </label>
          {labelAction}
        </div>
      )}
      <div className="relative flex items-center">
        {IconLeft && (
          <span className="pointer-events-none absolute left-3 flex text-muted-foreground">
            <IconLeft size={18} strokeWidth={2} aria-hidden />
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
            'h-12 w-full rounded-lg border border-input bg-card px-4 text-[15px] text-foreground transition-[border-color,box-shadow] duration-150 ease-[ease,ease] placeholder:text-muted-foreground focus:border-ring focus:shadow-[0_0_0_3px_var(--color-ring)]/25 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
            IconLeft && 'pl-11',
            rightSlot && 'pr-11',
            error && 'border-destructive focus:shadow-[0_0_0_3px_var(--color-destructive)]/25'
          )}
          {...rest}
        />
        {rightSlot && <span className="absolute right-2 flex items-center">{rightSlot}</span>}
      </div>
      {error && (
        <span id={`${inputId}-error`} className="text-[12px] text-destructive">
          {error}
        </span>
      )}
      {!error && helperText && (
        <span id={`${inputId}-helper`} className="text-[12px] text-muted-foreground">
          {helperText}
        </span>
      )}
    </div>
  );
});

export default Input;
