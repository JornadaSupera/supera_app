import { useId, type MouseEvent, type Ref } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/utils';

interface AuthorizationConsentProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  /** Vai ao marcador: é ele que recebe o foco quando a autorização falta no envio. */
  ref?: Ref<HTMLButtonElement>;
}

/**
 * A autorização que o paciente dá, explicitamente, antes de criar o acesso do
 * acompanhante.
 *
 * **Por que um aceite, e não uma lista de interruptores por tipo de dado.** O
 * escopo do acompanhante é ÚNICO e definido no contrato assinado; o banco não
 * tem — e não foi pedido a ele — um modelo de permissão por vínculo (a tabela
 * `permissions` só guarda os dois códigos de profissional: `alerts.triage` e
 * `schedule.manage`). Interruptores por categoria só existiriam nesta tela, e a
 * RLS continuaria devolvendo o mesmo conjunto de linhas: seriam um controle de
 * segurança falso num app de saúde — o paciente desligaria "diário" e o
 * acompanhante continuaria lendo o diário. Enquanto o banco não tiver o modelo,
 * o honesto é dizer com todas as letras o que será concedido e pedir a
 * autorização daquilo.
 *
 * **O que fica registrado.** Marcar aqui não grava uma linha própria: o que
 * grava é o ato seguinte. `link_caregiver_account` roda com o JWT do TITULAR e
 * cria, na mesma transação, o vínculo em `patient_caregivers` e a emissão em
 * `caregiver_credential_issuances`, com o paciente como autor — e o
 * `trg_audit_write` deixa a linha na trilha. Data, hora, canal e autor da
 * autorização ficam no banco, não na tela, e o titular os relê em "Registro de
 * autorizações".
 */
export default function AuthorizationConsent({ checked, onChange, error, ref }: AuthorizationConsentProps) {
  const textId = useId();
  const errorId = useId();

  function handleCardClick(event: MouseEvent<HTMLDivElement>) {
    // O marcador cuida de si — sem isto, o clique nele alternaria duas vezes.
    if ((event.target as HTMLElement).closest('[role="checkbox"]')) return;
    onChange(!checked);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        onClick={handleCardClick}
        className={cn(
          'flex cursor-pointer items-start gap-3 rounded-xl border-[1.5px] bg-card p-3.5 transition-[border-color,box-shadow] duration-150 ease-[ease]',
          checked
            ? 'border-primary-deep shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_18%,transparent)]'
            : 'border-border',
          error && !checked && 'border-destructive'
        )}
      >
        <button
          ref={ref}
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-labelledby={textId}
          aria-describedby={error ? errorId : undefined}
          onClick={() => onChange(!checked)}
          className={cn(
            'mt-[2px] inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md border-2 transition-colors duration-150 ease-[ease] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]',
            checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'
          )}
        >
          {checked && <Check size={13} strokeWidth={3} aria-hidden="true" />}
        </button>

        <p id={textId} className="text-[13px]/[1.45] text-foreground">
          <span className="font-semibold">Autorizo esta pessoa a acompanhar meu tratamento</span> com o
          acesso acima. Ela entra com o login dela, nunca vê a minha senha, e posso revogar quando
          quiser.
        </p>
      </div>

      <p className="flex items-start gap-1.5 text-[11px]/[1.4] text-muted-foreground">
        <ShieldCheck size={12} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
        Fica registrada com data e hora, em seu nome, em &ldquo;Registro de autorizações&rdquo;.
      </p>

      {error && (
        <p id={errorId} role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
