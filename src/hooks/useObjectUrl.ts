import { useEffect, useState } from 'react';

/**
 * Endereço `blob:` para mostrar um arquivo que está na memória, revogado
 * quando o arquivo muda ou a tela sai. Sem revogar, cada imagem aberta ficaria
 * presa na memória até o app fechar — e é imagem de saúde.
 *
 * Estado e efeito, e não `useMemo`: no StrictMode o efeito roda, limpa e roda
 * de novo, e com `useMemo` a limpeza revogaria o endereço que a tela ainda usa.
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return undefined;
    }

    const next = URL.createObjectURL(blob);
    setUrl(next);

    return () => URL.revokeObjectURL(next);
  }, [blob]);

  return url;
}
