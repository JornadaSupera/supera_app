import { useEffect, useState } from 'react';

/**
 * Devolve `value` só depois de `delayMs` sem mudança. Para campos cujo valor
 * vira chave de query (ex.: busca textual): sem isto, cada tecla criaria uma
 * chave nova — e uma ida ao servidor por caractere digitado.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
