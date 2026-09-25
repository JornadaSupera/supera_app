import { MessageCircle, Smartphone } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import type { CaregiverDelivery } from '../../types';

const OPTIONS: { value: CaregiverDelivery; title: string; description: string; icon: typeof MessageCircle }[] = [
  {
    value: 'whatsapp',
    title: 'WhatsApp',
    description: 'O app abre o WhatsApp com a mensagem pronta. A senha aparece só uma vez, na próxima tela.',
    icon: MessageCircle,
  },
  {
    value: 'sms',
    title: 'SMS',
    description: 'Enviamos a mensagem por SMS. Você não vê a senha.',
    icon: Smartphone,
  },
];

interface DeliveryOptionsProps {
  /** O `register('delivery')` do formulário: cada opção é um rádio de verdade. */
  registration: UseFormRegisterReturn;
}

/**
 * Como enviar os dados de acesso. Dois rádios nativos (teclado, leitor de tela
 * e foco funcionam de graça) vestidos de cartão: o "marcado" é o próprio
 * `:checked`, sem estado extra.
 */
export default function DeliveryOptions({ registration }: DeliveryOptionsProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-2 text-[13px] font-semibold text-foreground">Como enviar os dados de acesso?</legend>

      {OPTIONS.map(({ value, title, description, icon: Icon }) => (
        <label key={value} className="block cursor-pointer">
          <input type="radio" value={value} className="peer sr-only" {...registration} />
          <span className="flex items-start gap-3 rounded-xl border-[1.5px] border-border bg-card p-3.5 transition-[border-color,box-shadow] duration-150 ease-[ease] peer-checked:border-primary peer-checked:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_20%,transparent)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--color-ring)] [&>span:first-child>span]:scale-0 peer-checked:[&>span:first-child>span]:scale-100">
            <span
              aria-hidden="true"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-border bg-card"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-primary transition-transform duration-150 ease-[ease]" />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
                <Icon size={16} strokeWidth={2} className="text-[var(--color-supera-seguranca)]" aria-hidden="true" />
                {title}
              </span>
              <span className="block pt-1 text-[12px]/[1.5] text-muted-foreground">{description}</span>
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
