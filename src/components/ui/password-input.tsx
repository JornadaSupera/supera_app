import * as React from 'react';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Input, { type InputProps } from './input';

// Campo de senha com alternância de visibilidade. Fino sobre `Input`: reusa
// label, erro, ícone esquerdo e toda a validação — só fixa o tipo e injeta o
// botão de olho no `rightSlot`, que é exatamente o que essa prop existe para.
//
// `type` não é aceito como prop: o campo alterna entre 'password' e 'text'
// sozinho, então deixar o chamador informar `type` criaria dois donos para o
// mesmo estado.
export type PasswordInputProps = Omit<InputProps, 'type' | 'rightSlot'>;

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(props, ref) {
    const [visivel, setVisivel] = useState(false);
    const Icon = visivel ? EyeOff : Eye;

    return (
      <Input
        ref={ref}
        type={visivel ? 'text' : 'password'}
        rightSlot={
          <button
            type="button"
            onClick={() => setVisivel((atual) => !atual)}
            aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={visivel}
            // botão dentro do input: área de toque de 44px sem deformar a
            // altura de 48px do campo do lado de fora.
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-muted-foreground transition-colors duration-150 ease-[ease] hover:text-foreground"
          >
            <Icon size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        }
        {...props}
      />
    );
  }
);

export default PasswordInput;
