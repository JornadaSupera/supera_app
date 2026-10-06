import { useCallback, useRef } from 'react';
import { ringBell } from '../services/bellSound';

/**
 * O sino da tela surpresa do encerramento do tratamento.
 *
 * `ring` toca na hora. Se o aparelho ainda não liberou o som (ele pode exigir
 * um toque da pessoa antes), o toque fica pendente, e `ringIfPending` o toca
 * no primeiro toque na tela — uma vez só.
 */
export function useBellSound() {
  const isPendingRef = useRef(false);

  const ring = useCallback(async () => {
    isPendingRef.current = false;
    const played = await ringBell();
    if (!played) isPendingRef.current = true;
  }, []);

  const ringIfPending = useCallback(() => {
    if (isPendingRef.current) void ring();
  }, [ring]);

  return { ring, ringIfPending };
}
