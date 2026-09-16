import * as React from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StepHeaderProps extends React.HTMLAttributes<HTMLElement> {
  /** Texto curto de contexto (ex.: "Etapa 2 de 4", "Convite"). Opcional: nem toda tela de etapa precisa dele. */
  meta?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
}

/**
 * Cabeçalho compacto dos fluxos por etapas (onboarding, wizards, telas de
 * detalhe/convite). Sempre fixo, com borda e desfoque — o mesmo pacote
 * visual se repetia, idêntico, em toda tela que usava a antiga variante
 * `step` de `Header` (ver auditoria: achado sobre combinações inválidas).
 */
export default function StepHeader({ meta, onBack, actions, className, ...rest }: StepHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-[color-mix(in_srgb,var(--color-background)_95%,transparent)] px-6 pt-6 pb-3 backdrop-blur-[8px]',
        className
      )}
      {...rest}
    >
      {onBack && (
        <button
          type="button"
          className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-foreground transition-colors duration-150 ease-[ease] hover:bg-muted"
          onClick={onBack}
          aria-label="Voltar"
        >
          <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      )}

      {meta && <p className="text-[12px] font-medium text-muted-foreground">{meta}</p>}

      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
