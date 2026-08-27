import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps {
  id?: string;
  checked?: boolean;
  /**
   * Recebe o valor booleano, não o evento — mantido igual ao componente
   * antigo para não quebrar os consumidores. Com React Hook Form, use
   * `<Controller>` (o `register` espera um evento).
   */
  onChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * `forwardRef` existe para o RHF conseguir focar o campo ao reportar erro —
 * o componente antigo não encaminhava a ref, então o foco nunca chegava.
 */
const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { id, checked = false, onChange, label, disabled = false, className },
  ref
) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-center justify-between gap-3 [-webkit-tap-highlight-color:transparent]',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        className
      )}
    >
      {label && <span className="text-[14px] text-foreground">{label}</span>}

      <span
        data-checked={checked}
        className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-muted transition-colors duration-150 ease-[ease] data-[checked=true]:bg-primary"
      >
        <input
          ref={ref}
          type="checkbox"
          id={id}
          role="switch"
          aria-checked={checked}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange?.(event.target.checked)}
          className="sr-only"
        />
        <span
          aria-hidden="true"
          // `peer` não serve aqui: o alvo do foco é o input, e o thumb é irmão
          // posterior dentro do mesmo track — daí o seletor arbitrário.
          className="absolute top-[2px] left-[2px] h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ease-[ease] [:focus-visible~&]:outline-2 [:focus-visible~&]:outline-offset-2 [:focus-visible~&]:outline-[var(--color-ring)] [[data-checked=true]>&]:translate-x-4"
        />
      </span>
    </label>
  );
});

export default Switch;
