import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface RevealableValueProps {
  masked: string;
  full: string;
  canReveal: boolean;
  ariaLabel: string;
}

/**
 * CPF/telefone/e-mail ficam mascarados por padrão e só revelam sob ação
 * explícita (Regra nº3) — e essa ação é exclusiva do titular. Um acompanhante
 * lê o perfil do tutelado normalmente, mas não ganha o controle de revelar o
 * dado dele — mesmo espírito de `useCanMarkResources` (RLS decide o acesso,
 * isto é só a UI não oferecer a ação a quem não é dona do dado).
 */
export default function RevealableValue({ masked, full, canReveal, ariaLabel }: RevealableValueProps) {
  const [revealed, setRevealed] = useState(false);

  if (!canReveal) {
    return <p className="text-body break-words text-foreground">{masked}</p>;
  }

  return (
    <button
      type="button"
      onClick={() => setRevealed((current) => !current)}
      aria-pressed={revealed}
      aria-label={revealed ? `Ocultar ${ariaLabel}` : `Mostrar ${ariaLabel}`}
      // A linha do `text-body` tem 24 px; o `after` estende a área de toque
      // para 48 px (24 + 12 + 12) sem mudar o desenho (embaixo, cabe no
      // respiro de 16 px do próprio cartão).
      className="relative flex min-h-6 w-full cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left text-body text-foreground after:absolute after:inset-x-0 after:-inset-y-3"
    >
      <span className="min-w-0 break-words">{revealed ? full : masked}</span>
      {revealed ? (
        <EyeOff size={20} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : (
        <Eye size={20} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
    </button>
  );
}
