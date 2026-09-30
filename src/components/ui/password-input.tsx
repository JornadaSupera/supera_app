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

// A `ref` (prop comum no React 19) segue para o `Input` dentro de `props`.
export default function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <Input
      type={visible ? 'text' : 'password'}
      rightSlot={
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
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
