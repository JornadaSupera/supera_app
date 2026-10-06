import * as React from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StepHeaderProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * Título da tela, na própria barra, ao lado do voltar. É o `<h1>` da tela:
   * quem usa não repete o título no corpo, e a barra deixa de ser só uma seta
   * num fundo vazio.
   */
  title?: string;
  /** Texto curto de contexto (ex.: "Etapa 2 de 4", "Orientação"). Opcional: nem toda tela de etapa precisa dele. */
  meta?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
}

/**
 * Cabeçalho compacto dos fluxos por etapas (onboarding, wizards, telas de
 * detalhe). Sempre fixo, com borda e desfoque — o mesmo pacote
 * visual se repetia, idêntico, em toda tela que usava a antiga variante
 * `step` de `Header`, que aceitava combinações de props sem sentido.
 *
 * Baixo de propósito: 56 px abaixo do relógio, só o voltar de 48 px e 4 px
 * acima e abaixo (pedido de 05/10: a barra alta tirava espaço do conteúdo).
 *
 * Recuo lateral de 16 px (`px-safe-4`), a margem das telas no guia da clínica.
 * Tela que ainda usa 24 px passa `px-safe-6` no `className`: ele vence por vir
 * depois no CSS (o tailwind-merge não conhece os utilitários `px-safe-*`).
 */
export default function StepHeader({
  title,
  meta,
  onBack,
  actions,
  className,
  ...rest
}: StepHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-20 bleed-x flex items-center gap-3 border-b border-border bg-[color-mix(in_srgb,var(--color-background)_95%,transparent)] min-h-[calc(3.5rem_+_var(--safe-top))] px-safe-4 pt-[calc(0.25rem_+_var(--safe-top))] pb-1 backdrop-blur-[8px]',
        className
      )}
      {...rest}
    >
      {/* 48 px de toque e a seta de 24 px em `teal-deep`, como pede o guia. O
          `-ml-3` põe a seta na margem da tela, no mesmo lugar do voltar do
          `TabHeader` e da capa das telas de fluxo. */}
      {onBack && (
        <button
          type="button"
          className="-ml-3 inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-primary-deep transition-colors duration-150 ease-[ease] hover:bg-muted"
          onClick={onBack}
          aria-label="Voltar"
        >
          <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
        </button>
      )}

      {title && (
        <h1 className="min-w-0 flex-1 truncate text-section font-bold text-foreground">
          {title}
        </h1>
      )}

      {meta && <p className="text-caption font-medium text-muted-foreground">{meta}</p>}

      {/* Depois do voltar ou do contexto, as ações vão para a borda direita
          (`ml-auto`), mesmo sem o título, que é quem as empurrava. Sozinhas na
          barra (o "Sair" da LGPD), ficam onde estão. */}
      {actions && <div className="flex shrink-0 items-center gap-2 not-first:ml-auto">{actions}</div>}
    </header>
  );
}
