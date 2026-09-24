import { useCallback, useEffect, useState } from 'react';

/**
 * Contagem regressiva em segundos, para o reenvio do código do SMS. Chega a
 * zero e para; `restart` volta ao valor inicial (a cada novo envio).
 */
export function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) return undefined;

    const timer = window.setTimeout(() => setRemaining((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);

  const restart = useCallback(() => setRemaining(seconds), [seconds]);

  return { remaining, restart };
}
