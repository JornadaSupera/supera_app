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
        // Campo do guia da clínica, como o `Input`: branco, cantos de 8 px, texto
        // `text-body` (16/24, a entrelinha vem do próprio nome); no foco, a
        // borda escurece e o anel laranja do app aparece.
        'w-full resize-none rounded-sm border border-input bg-card p-3.5 text-body text-foreground transition-[border-color] duration-150 ease-[ease] placeholder:text-muted-foreground focus:border-primary-deep',
        className
      )}
      {...rest}
    />
  );
}
