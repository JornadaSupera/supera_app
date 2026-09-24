import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  requestPhoneVerification,
  resendPhoneVerification,
  verifyPhoneCode,
} from '../services/mockApi';
import { useLinkPatientByVerifiedPhone } from './useAuth';
import { useCountdown } from './useCountdown';

/** Espera entre um envio do código e o seguinte. */
export const RESEND_SECONDS = 60;

interface PhoneVerificationInput {
  /** Celular no formato internacional (`+5549999887766`). */
  phone: string;
  /** Vão junto ao vínculo, depois que o celular for confirmado. */
  cpf: string;
  birthDate: string;
  /** A conta foi ligada à ficha: a tela segue para dentro do app. */
  onLinked: () => void;
}

/**
 * A verificação do celular por SMS, de ponta a ponta: envia o código ao abrir
 * a tela, deixa reenviar depois da contagem e, com o código certo, liga a conta
 * à ficha.
 *
 * O código é de uso único, então confirmar e ligar são dois passos com estado
 * próprio: se o celular foi confirmado e o vínculo falhou (ex.: CPF que não
 * confere), tentar de novo repete só o vínculo — repetir o código o recusaria.
 */
export function usePhoneVerification({ phone, cpf, birthDate, onLinked }: PhoneVerificationInput) {
  const [phoneConfirmed, setPhoneConfirmed] = useState(false);
  const { remaining, restart } = useCountdown(RESEND_SECONDS);

  const sendMutation = useMutation({ mutationFn: () => requestPhoneVerification(phone) });
  const verifyMutation = useMutation({
    mutationFn: (code: string) => verifyPhoneCode(phone, code),
    onSuccess: () => setPhoneConfirmed(true),
  });
  const resendMutation = useMutation({
    mutationFn: () => resendPhoneVerification(phone),
    onSuccess: () => {
      // Um código novo saiu: o aviso do envio que falhou e o de "código
      // incorreto" eram sobre o anterior e não valem mais.
      sendMutation.reset();
      verifyMutation.reset();
      restart();
    },
  });
  const linkMutation = useLinkPatientByVerifiedPhone();

  // O envio acontece ao abrir a tela, uma vez: no modo estrito do React o
  // efeito roda duas vezes, e sem a trava saíam dois SMS.
  const sentRef = useRef(false);
  const { mutate: sendCode } = sendMutation;
  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    sendCode();
  }, [sendCode]);

  async function confirm(code: string) {
    if (!phoneConfirmed) {
      try {
        await verifyMutation.mutateAsync(code);
      } catch {
        return;
      }
    }

    linkMutation.mutate({ cpf, birthDate }, { onSuccess: onLinked });
  }

  // O erro que importa é o da etapa em que a pessoa está: o vínculo vem depois
  // do código, e o envio vem antes de tudo.
  const failure = [linkMutation, verifyMutation, resendMutation, sendMutation].find(
    (mutation) => mutation.isError
  )?.error;

  return {
    // Se o primeiro envio falhou não há código a esperar: pedir de novo é a
    // única saída, e fazer a pessoa contar 60 segundos diante do erro só pune.
    secondsToResend: sendMutation.isError ? 0 : remaining,
    isSending: sendMutation.isPending || resendMutation.isPending,
    isConfirming: verifyMutation.isPending || linkMutation.isPending,
    phoneConfirmed,
    error: failure ?? null,
    confirm,
    resend: () => resendMutation.mutate(),
  };
}
