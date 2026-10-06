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
  /**
   * Chega ao input nativo para o RHF conseguir focar o campo ao reportar erro
   * (no React 19 a `ref` é prop comum, sem `forwardRef`).
   */
  ref?: React.Ref<HTMLInputElement>;
}

export default function Switch({
  id,
  checked = false,
  onChange,
  label,
  disabled = false,
  className,
  ref,
}: SwitchProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        // A linha inteira é o alvo do toque: 48 px de altura, no mínimo.
        'flex min-h-12 items-center justify-between gap-3 [-webkit-tap-highlight-color:transparent]',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        className
      )}
    >
      {label && <span className="text-body text-foreground">{label}</span>}

      {/* Trilho com contorno nos dois estados, para ser visto sobre o branco:
          desligado, cinza (o texto de apoio a 40%); ligado, o verde da marca
          com o contorno no verde escuro. A posição da bolinha diz o estado. */}
      <span
        data-checked={checked}
        className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-muted-foreground bg-[color-mix(in_srgb,var(--color-muted-foreground)_40%,transparent)] transition-colors duration-150 ease-[ease] data-[checked=true]:border-primary-deep data-[checked=true]:bg-primary"
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
          // posterior dentro do mesmo track — daí o seletor arbitrário. A
          // bolinha é branca nos dois temas (`--color-highlight`) e mede 18 px
          // para caber, com 2 px de folga, dentro do contorno do trilho.
          className="absolute top-[2px] left-[2px] size-[18px] rounded-full bg-[var(--color-highlight)] shadow-sm transition-transform duration-150 ease-[ease] [:focus-visible~&]:outline-2 [:focus-visible~&]:outline-offset-2 [:focus-visible~&]:outline-[var(--color-ring)] [[data-checked=true]>&]:translate-x-4"
        />
      </span>
    </label>
  );
}
