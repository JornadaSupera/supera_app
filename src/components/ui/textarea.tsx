import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /**
   * Chega ao `<textarea>` nativo — o RHF a usa para focar o campo com erro (no
   * React 19 a `ref` é prop comum, sem `forwardRef`).
   */
  ref?: React.Ref<HTMLTextAreaElement>;
}

/**
 * Campo de texto longo, em caixa: o da primeira mensagem de uma conversa e o
 * do pedido de correção dos dados. A altura mínima fica com quem usa.
 */
export default function Textarea({ className, ref, ...rest }: TextareaProps) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full resize-none rounded-xl border border-border bg-background p-3.5 text-[16px] leading-[1.45] text-foreground transition-[border-color,box-shadow] duration-150 ease-[ease] placeholder:text-muted-foreground focus:border-ring focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-ring)_20%,transparent)] focus:outline-none',
        className
      )}
      {...rest}
    />
  );
}
