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
    return <p className="mt-[2px] text-[14px] leading-[1.4] break-words text-foreground">{masked}</p>;
  }

  return (
    <button
      type="button"
      onClick={() => setRevealed((current) => !current)}
      aria-pressed={revealed}
      aria-label={revealed ? `Ocultar ${ariaLabel}` : `Mostrar ${ariaLabel}`}
      // A linha tem 24px de altura; o `after` estende a área de toque para 44px
      // sem mudar o desenho (cabe no respiro do próprio cartão).
      className="relative mt-[2px] flex min-h-[24px] w-full cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left text-[14px] leading-[1.4] text-foreground after:absolute after:inset-x-0 after:-inset-y-[10px]"
    >
      <span className="min-w-0 break-words">{revealed ? full : masked}</span>
      {revealed ? (
        <EyeOff size={14} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : (
        <Eye size={14} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
    </button>
  );
}
