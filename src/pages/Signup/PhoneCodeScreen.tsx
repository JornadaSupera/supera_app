import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import FlowScreen from '../../components/ui/flow-screen';
import Input from '../../components/ui/input';
import InlineError from '../../components/ui/inline-error';
import Button from '../../components/ui/button';
import EntryHero from '../Onboarding/EntryHero';
import {
  PHONE_CODE_LENGTH,
  phoneCodeSchema,
  type PhoneCodeFormValues,
} from '../../schemas/signup';
import { maskedRegister } from '../../utils/maskedInput';

const FORM_ID = 'phone-code-form';

/** Só números, no máximo o tamanho do código: o que colar do SMS entra limpo. */
function keepCodeDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, PHONE_CODE_LENGTH);
}

/** `75` -> `1:15` */
function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export interface PhoneCodeScreenProps {
  /** Celular já mascarado (`(49) •••••-8888`): o suficiente para reconhecer o número. */
  phoneLabel: string;
  secondsToResend: number;
  /** Enviando (ou reenviando) o SMS. */
  isSending: boolean;
  isConfirming: boolean;
  /** O código já foi aceito; só o vínculo falhou e será repetido. */
  phoneConfirmed: boolean;
  /** CPF ou nascimento não conferem: o botão principal vira "Corrigir dados". */
  needsDataCorrection?: boolean;
  onCorrectData?: () => void;
  error: string | null;
  onConfirm: (code: string) => void;
  onResend: () => void;
  /** A outra saída, sob o botão principal (ex.: "Confirmar depois", "Sair desta conta"). */
  secondary: { label: string; onClick: () => void; loading?: boolean };
  /** Voltar para corrigir o número. Sem ele a tela não tem volta (a conta já existe). */
  onBack?: () => void;
}

/**
 * Tela do código que chega por SMS: campo grande, contagem de 60 segundos para
 * reenviar e o botão de confirmar. É só apresentação — o envio, a conferência e o vínculo
 * estão em `usePhoneVerification`, e por isso a tela se testa e se vê sem SMS
 * nenhum.
 */
export default function PhoneCodeScreen({
  phoneLabel,
  secondsToResend,
  isSending,
  isConfirming,
  phoneConfirmed,
  needsDataCorrection = false,
  onCorrectData,
  error,
  onConfirm,
  onResend,
  secondary,
  onBack,
}: PhoneCodeScreenProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PhoneCodeFormValues>({
    resolver: zodResolver(phoneCodeSchema),
    mode: 'onTouched',
    defaultValues: { code: '' },
  });

  // Com o código aceito, reenviar não faz sentido: o celular já é desta conta.
  const canResend = secondsToResend <= 0 && !isSending && !isConfirming && !phoneConfirmed;

  return (
    <FlowScreen
      tone="brand"
      title="Confirme seu celular"
      subtitle={`Enviamos um código de ${PHONE_CODE_LENGTH} números por SMS para ${phoneLabel}.`}
      hero={<EntryHero variant="sms" />}
      onBack={onBack}
      footer={
        <>
          {/* Chaves diferentes: sem elas o React reaproveitaria o mesmo
              <button> e, se o estado trocasse no meio de um toque em
              "Corrigir dados", o navegador encontraria no lugar o botão de
              envio (o defeito que finalizava o registro do diário). */}
          {needsDataCorrection && onCorrectData ? (
            // Repetir com o mesmo CPF e nascimento daria a mesma recusa.
            <Button key="correct" type="button" variant="brand" size="xl" fullWidth onClick={onCorrectData}>
              Corrigir dados
            </Button>
          ) : (
            <Button
              key="confirm"
              type="submit"
              form={FORM_ID}
              variant="brand"
              size="xl"
              fullWidth
              loading={isConfirming}
            >
              {phoneConfirmed ? 'Tentar de novo' : 'Confirmar celular'}
            </Button>
          )}
          <Button variant="ghost" fullWidth loading={secondary.loading} onClick={secondary.onClick}>
            {secondary.label}
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        noValidate
        onSubmit={handleSubmit(({ code }) => onConfirm(code))}
      >
        <Input
          label="Código do SMS"
          id="phone-code"
          inputMode="numeric"
          // O sistema oferece o código recém-chegado por cima do teclado.
          autoComplete="one-time-code"
          placeholder="••••••"
          maxLength={PHONE_CODE_LENGTH}
          // Depois de aceito o código não vale de novo: o campo trava.
          readOnly={phoneConfirmed}
          // O espaçamento entre os números também empurra o último para a
          // direita; o recuo à esquerda compensa e mantém o centro.
          inputClassName="h-14 pl-[0.5em] text-center text-hero font-semibold tracking-[0.5em]"
          error={errors.code?.message}
          {...maskedRegister(register, 'code', keepCodeDigits)}
        />
      </form>

      {/* `min-h-12`: a linha já tem a altura do botão de reenviar, e não pula
          quando a contagem acaba. O reenviar é o botão `sm` do guia (48 px e
          `text-label`); o `-mr-3` alinha o texto dele com a borda do campo. */}
      <div className="flex min-h-12 items-center justify-between gap-3 text-body-sm text-muted-foreground">
        <span>{phoneConfirmed ? 'Celular confirmado.' : 'Não recebeu o código?'}</span>
        {phoneConfirmed ? null : canResend ? (
          <Button variant="ghost" size="sm" className="-mr-3 px-3" onClick={onResend}>
            Reenviar código
          </Button>
        ) : (
          <span className="tabular-nums" aria-live="off">
            {isSending ? 'Enviando…' : `Reenviar em ${formatCountdown(secondsToResend)}`}
          </span>
        )}
      </div>

      {error && <InlineError title={error} description="" />}
    </FlowScreen>
  );
}
