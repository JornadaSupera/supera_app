import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import FlowScreen from '../../components/ui/flow-screen';
import Input from '../../components/ui/input';
import Button from '../../components/ui/button';
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
  error: string | null;
  onConfirm: (code: string) => void;
  onResend: () => void;
  onSignOut: () => void;
  isSigningOut?: boolean;
}

/**
 * Tela do código que chega por SMS: campo grande, contagem para reenviar e o
 * botão de confirmar. É só apresentação — o envio, a conferência e o vínculo
 * estão em `usePhoneVerification`, e por isso a tela se testa e se vê sem SMS
 * nenhum.
 */
export default function PhoneCodeScreen({
  phoneLabel,
  secondsToResend,
  isSending,
  isConfirming,
  phoneConfirmed,
  error,
  onConfirm,
  onResend,
  onSignOut,
  isSigningOut = false,
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

  const canResend = secondsToResend <= 0 && !isSending && !isConfirming;

  return (
    <FlowScreen
      title="Confirme seu celular"
      subtitle={`Enviamos um código de ${PHONE_CODE_LENGTH} números por SMS para ${phoneLabel}.`}
      footer={
        <>
          <Button
            type="submit"
            form={FORM_ID}
            fullWidth
            iconRight={phoneConfirmed ? undefined : ArrowRight}
            loading={isConfirming}
          >
            {phoneConfirmed ? 'Tentar de novo' : 'Confirmar celular'}
          </Button>
          <Button variant="ghost" fullWidth loading={isSigningOut} onClick={onSignOut}>
            Sair desta conta
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
          inputClassName="h-14 pl-[0.5em] text-center text-[26px] font-semibold tracking-[0.5em]"
          error={errors.code?.message}
          {...maskedRegister(register, 'code', keepCodeDigits)}
        />
      </form>

      <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
        <span>Não recebeu o código?</span>
        {canResend ? (
          <Button variant="ghost" onClick={onResend}>
            Reenviar código
          </Button>
        ) : (
          <span className="tabular-nums" aria-live="off">
            {isSending ? 'Enviando…' : `Reenviar em ${formatCountdown(secondsToResend)}`}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-[12px]/[1.5] text-destructive">
          {error}
        </p>
      )}
    </FlowScreen>
  );
}
