import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
  /**
   * Recebe o valor booleano, não o evento — mantido igual ao componente
   * antigo para não quebrar os consumidores. Com React Hook Form, use
   * `<Controller>` (o `register` espera um evento).
   */
  onChange?: (checked: boolean) => void;
  label?: React.ReactNode;
}

/**
 * `forwardRef` existe para o RHF conseguir focar o campo ao reportar erro —
 * o componente antigo não encaminhava a ref, então o foco nunca chegava.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { id, checked = false, onChange, label, className, ...rest },
  ref
) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-[14px] [-webkit-tap-highlight-color:transparent]',
        className
      )}
    >
      {/* Input nativo mantido no DOM para acessibilidade (foco, leitor de
          tela, teclado) e escondido visualmente; o quadrado visível é o span
          seguinte, que reage via `peer-*`. */}
      <input
        ref={ref}
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(event) => onChange?.(event.target.checked)}
        className="peer sr-only"
        {...rest}
      />
      <span
        aria-hidden="true"
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] border-input bg-transparent transition-[background-color,border-color] duration-150 ease-[ease] peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--color-ring)]"
      >
        {checked && <Check size={12} strokeWidth={3} className="text-primary-foreground" />}
      </span>
      <span className="text-[13px]/[1.5] text-foreground">{label}</span>
    </label>
  );
});

export default Checkbox;
