import { useCallback, useEffect, useRef, useState } from 'react';
import { useRefreshIdentity } from './useAuth';

/** Intervalo entre as conferências automáticas, com a tela à vista. */
export const PENDING_CHECK_INTERVAL_MS = 30_000;

/** Quanto tempo o retorno do "Verificar agora" fica na tela. */
const FEEDBACK_VISIBLE_MS = 8_000;

/**
 * O que a pessoa vê depois de tocar em "Verificar agora" e a tela continuar
 * ali: se tivesse dado certo o app já teria aberto.
 *
 * - `not-yet`: a conferência rodou e o cadastro ainda não foi liberado.
 * - `offline`: o aparelho está sem internet, então nada foi conferido de fato.
 *
 * A releitura da identidade nunca lança (ver `refreshIdentity`), então "falhou"
 * e "ainda não" chegam iguais aqui; `navigator.onLine` é o que separa o caso em
 * que dizer "ainda não foi liberado" seria mentira.
 */
export type PendingCheckFeedback = 'not-yet' | 'offline';

/**
 * Confere se a recepção já concluiu o cadastro, para a tela de espera.
 *
 * Reler a identidade é tudo que existe a fazer: quando a clínica liga a conta
 * à ficha, a store passa a `autenticado` e o guarda de rota abre o app sozinho
 * — quem espera não precisa tocar em nada. A conferência roda de tempos em
 * tempos, ao voltar para o app (o aparelho estava no bolso) e quando a rede
 * volta; nunca com a tela escondida, e nunca duas ao mesmo tempo.
 *
 * `check` é o botão "Verificar agora". Só ele acende `isChecking` e produz
 * `feedback`: as conferências automáticas são silenciosas, senão o botão viraria
 * um spinner a cada meio minuto sem a pessoa ter tocado em nada.
 */
export function usePendingRegistrationCheck() {
  const { mutate, isPending } = useRefreshIdentity();
  const [isChecking, setIsChecking] = useState(false);
  const [feedback, setFeedback] = useState<PendingCheckFeedback | null>(null);

  const pendingRef = useRef(isPending);
  useEffect(() => {
    pendingRef.current = isPending;
  }, [isPending]);

  const autoCheck = useCallback(() => {
    if (pendingRef.current) return;
    mutate();
  }, [mutate]);

  const check = useCallback(() => {
    setIsChecking(true);
    setFeedback(null);
    mutate(undefined, {
      onSettled: () => {
        setIsChecking(false);
        setFeedback(navigator.onLine ? 'not-yet' : 'offline');
      },
    });
  }, [mutate]);

  useEffect(() => {
    if (!feedback) return undefined;

    const timer = window.setTimeout(() => setFeedback(null), FEEDBACK_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    function checkIfVisible() {
      if (document.visibilityState === 'visible') autoCheck();
    }

    const timer = window.setInterval(checkIfVisible, PENDING_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', checkIfVisible);
    window.addEventListener('online', autoCheck);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', checkIfVisible);
      window.removeEventListener('online', autoCheck);
    };
  }, [autoCheck]);

  return { check, isChecking, feedback };
}
