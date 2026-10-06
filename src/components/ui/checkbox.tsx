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
  /**
   * Chega ao input nativo para o RHF conseguir focar o campo ao reportar erro
   * (no React 19 a `ref` é prop comum, sem `forwardRef`).
   */
  ref?: React.Ref<HTMLInputElement>;
}

export default function Checkbox({
  id,
  checked = false,
  onChange,
  label,
  className,
  ref,
  ...rest
}: CheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4 [-webkit-tap-highlight-color:transparent]',
        className
      )}
    >
      {/* Input nativo mantido no DOM para acessibilidade (foco, leitor de
          tela, teclado) e escondido visualmente; o quadrado visível é o span
          seguinte, que reage via `peer-*`: 24 px, com a borda de 2 px no
          cinza do texto de apoio, para ser visto por quem tem a visão
          cansada. Ele fica centrado na primeira linha do texto
          (`text-body-sm`, 21 px): a margem negativa põe o 1,5 px que sobra
          em cima e embaixo no respiro do cartão. */}
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
        className="-my-[1.5px] flex size-6 shrink-0 items-center justify-center rounded-sm border-2 border-muted-foreground bg-card transition-[background-color,border-color] duration-150 ease-[ease] peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--color-ring)]"
      >
        {/* Traço 3 no ícone de 16 px: desenha os 2 px do guia. */}
        {checked && <Check size={16} strokeWidth={3} className="text-primary-foreground" />}
      </span>
      <span className="text-body-sm text-foreground">{label}</span>
    </label>
  );
}
