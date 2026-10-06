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
      {/* Marcado, o cartão segue o selecionado do guia da clínica: contorno
          `teal-deep` e fundo `surface-teal`. A caixa tem cantos de 8 px — com
          o raio dos botões (14) ela virava um círculo — e fica centrada na
          primeira linha do texto (`text-body-sm`, 21 px), como a `Checkbox`
          do app: a margem negativa põe o 1,5 px que sobra no respiro do
          cartão. */}
      <div
        onClick={handleCardClick}
        className={cn(
          'flex cursor-pointer items-start gap-3 rounded-xl border-2 bg-card p-4 transition-[border-color,background-color] duration-150 ease-[ease]',
          checked ? 'border-primary-deep bg-secondary' : 'border-border',
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
            '-my-[1.5px] inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-sm border-2 transition-colors duration-150 ease-[ease] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]',
            checked ? 'border-primary-deep bg-primary text-primary-foreground' : 'border-muted-foreground bg-card'
          )}
        >
          {checked && <Check size={16} strokeWidth={3} aria-hidden="true" />}
        </button>

        <p id={textId} className="text-body-sm text-foreground">
          <span className="font-semibold">Autorizo esta pessoa a acompanhar meu tratamento</span> com o
          acesso acima. Ela entra com o login dela, nunca vê a minha senha, e posso revogar quando
          quiser.
        </p>
      </div>

      {/* O ícone de 16 px a 8 px do texto, como no rodapé dos cartões do guia
          (e no aviso de "Meu acompanhante"); o `mt-px` o centra na linha da
          legenda (18 px). */}
      <p className="flex items-start gap-2 text-caption font-medium text-muted-foreground">
        <ShieldCheck size={16} strokeWidth={2} className="mt-px shrink-0" aria-hidden="true" />
        Fica registrada com data e hora, em seu nome, em &ldquo;Registro de autorizações&rdquo;.
      </p>

      {error && (
        <p id={errorId} role="alert" className="text-caption font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
