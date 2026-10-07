import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PHONE_CONFIRMED_ELSEWHERE,
  PHONE_IN_USE,
  requestPhoneVerification,
  verifyPhoneCode,
} from '../services/auth';
import { CONFIRMED_PHONE_KEY, useLinkPatientByVerifiedPhone } from './useAuth';
import { useCountdown } from './useCountdown';
import { AppError } from '../lib/appError';
import { useToast } from '../contexts/ToastContext';

/** Espera entre um envio do código e o seguinte. */
export const RESEND_SECONDS = 60;

/** O código da recusa da ligação, quando ela veio do banco (guia 5.12). */
function refusalCode(error: unknown): string | null {
  return error instanceof AppError ? error.code : null;
}

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
 * à ficha — o único caminho do app desde 29/09 (o código do Centro saiu).
 *
 * O código é de uso único, então confirmar e ligar são dois passos com estado
 * próprio: se o celular foi confirmado e o vínculo falhou (ex.: CPF que não
 * confere), tentar de novo repete só o vínculo — repetir o código o recusaria.
 */
export function usePhoneVerification({ phone, cpf, birthDate, onLinked }: PhoneVerificationInput) {
  const [phoneConfirmed, setPhoneConfirmed] = useState(false);
  // O banco não reconhece mais a confirmação (`phone_not_verified`: o pedido
  // venceu ou o número mudou): só um código novo resolve, e já.
  const [needsNewCode, setNeedsNewCode] = useState(false);
  const { remaining, restart } = useCountdown(RESEND_SECONDS);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const sendMutation = useMutation({ mutationFn: () => requestPhoneVerification(phone) });
  const verifyMutation = useMutation({
    mutationFn: (code: string) => verifyPhoneCode(phone, code),
    onSuccess: () => {
      setPhoneConfirmed(true);
      // A conta passou a ter o celular confirmado: quem voltar para corrigir os
      // dados liga direto, sem SMS (ver `useConfirmedPhone`).
      void queryClient.invalidateQueries({ queryKey: CONFIRMED_PHONE_KEY });
    },
    // A sessão já saiu (o código confirmou o celular em outra conta): a tela
    // pode sumir no caminho para o login, então o aviso vai também por toast.
    onError: (error) => {
      if (refusalCode(error) === PHONE_CONFIRMED_ELSEWHERE) {
        showToast(error.message, { variant: 'error' });
      }
    },
  });
  const linkMutation = useLinkPatientByVerifiedPhone();
  // Reenviar é pedir de novo: o pedido não confirmado some em 15 minutos, e só
  // `updateUser` o recria (ver `requestPhoneVerification`).
  const resendMutation = useMutation({
    mutationFn: () => requestPhoneVerification(phone),
    onSuccess: () => {
      // Um código novo saiu: os avisos sobre o anterior não valem mais.
      sendMutation.reset();
      verifyMutation.reset();
      linkMutation.reset();
      setPhoneConfirmed(false);
      setNeedsNewCode(false);
      restart();
    },
  });

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

    linkMutation.mutate(
      { cpf, birthDate },
      {
        onSuccess: onLinked,
        onError: (error) => {
          if (refusalCode(error) === 'phone_not_verified') {
            setPhoneConfirmed(false);
            setNeedsNewCode(true);
          }
        },
      }
    );
  }

  // O erro que importa é o da etapa em que a pessoa está: o vínculo vem depois
  // do código, e o envio vem antes de tudo.
  const failure = [linkMutation, verifyMutation, resendMutation, sendMutation].find(
    (mutation) => mutation.isError
  )?.error;

  // O celular já está confirmado em outra conta: o Auth recusa antes de mandar
  // o SMS, e nenhum reenvio muda isso. A tela troca o campo do código pelo
  // caminho a seguir.
  const phoneInUse = [sendMutation, resendMutation, verifyMutation].some(
    (mutation) => refusalCode(mutation.error) === PHONE_IN_USE
  );

  return {
    phoneInUse,
    // Se o envio falhou, ou o banco pede um código novo, não há o que esperar:
    // fazer a pessoa contar 60 segundos diante do erro só pune.
    secondsToResend: sendMutation.isError || needsNewCode ? 0 : remaining,
    isSending: sendMutation.isPending || resendMutation.isPending,
    isConfirming: verifyMutation.isPending || linkMutation.isPending,
    phoneConfirmed,
    // CPF ou nascimento não conferem: repetir com os mesmos dados não adianta,
    // a pessoa precisa corrigi-los.
    needsDataCorrection: linkMutation.isError && refusalCode(linkMutation.error) === 'invalid_invitation',
    error: failure ?? null,
    confirm,
    resend: () => resendMutation.mutate(),
  };
}
