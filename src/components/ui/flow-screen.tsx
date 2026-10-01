import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import BrandHeader from './brand-header';
import StepHeader from './step-header';
import StickyFooter from './sticky-footer';

export interface FlowScreenProps {
  title: string;
  /** Uma frase curta sob o título. Mais que isso já é texto demais para o topo do formulário. */
  subtitle?: string;
  /** Contexto curto ao lado do voltar (ex.: "Etapa 1 de 3"). */
  meta?: string;
  onBack?: () => void;
  /** Ações fixas no rodapé, uma sobre a outra: a principal primeiro. */
  footer?: ReactNode;
  /**
   * `plain`: a barra com o título ao lado do voltar. `brand`: a capa verde do
   * login (`BrandHeader`), para as telas de entrada — cadastro e recuperação
   * de senha.
   */
  tone?: 'plain' | 'brand';
  /** O medalhão ao lado do título, só no `brand` (ver `EntryHero`). */
  hero?: ReactNode;
  children?: ReactNode;
  className?: string;
}

interface CoverNavProps {
  onBack?: () => void;
  meta?: string;
}

/** A linha de cima da capa: o voltar, em branco, e o contexto ao lado dele. */
function CoverNav({ onBack, meta }: CoverNavProps) {
  return (
    // `-ml-3`: a seta fica alinhada com o título, e a área de toque continua com 44 px.
    <div className="-ml-3 flex min-h-11 items-center gap-1">
      {onBack && (
        <button
          type="button"
          aria-label="Voltar"
          onClick={onBack}
          className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[var(--color-on-brand-cover)] transition-colors duration-150 ease-[ease] hover:bg-[color-mix(in_srgb,var(--color-on-brand-cover)_14%,transparent)] focus-visible:outline-2 focus-visible:outline-[var(--color-on-brand-cover)]"
        >
          <ChevronLeft size={22} strokeWidth={2.2} aria-hidden="true" />
        </button>
      )}
      {meta && <p className="text-[13px] font-medium">{meta}</p>}
    </div>
  );
}

/**
 * Moldura das telas de um fluxo de entrada (cadastro, confirmação do
 * celular, recuperação de senha): o topo, uma frase, o conteúdo, e a ação fixa
 * no rodapé.
 *
 * No `plain` o topo é enxuto de propósito — o título mora na barra (que assim
 * não fica só com uma seta) e o corpo começa direto na frase, sem ícone grande
 * nem título repetido, para o primeiro campo aparecer sem rolar. Entre o texto
 * e o conteúdo há 20px, e entre as ações do rodapé, 12px: botão colado no
 * texto é o defeito que esta moldura existe para evitar.
 *
 * No `brand` o título e a frase moram na capa, e o conteúdo sobe logo depois
 * dela (`animate-rise`), como os blocos do login. A ação principal do rodapé
 * é de quem usa: nas telas de entrada, o `Button` da marca.
 *
 * Os raios de borda são os menores das telas de entrada (`compact-radii`, em
 * `index.css`, o mesmo do onboarding e do login).
 */
export default function FlowScreen({
  title,
  subtitle,
  meta,
  onBack,
  footer,
  tone = 'plain',
  hero,
  children,
  className,
}: FlowScreenProps) {
  const footerBar = footer && <StickyFooter className="flex flex-col gap-3">{footer}</StickyFooter>;

  if (tone === 'brand') {
    return (
      <div className={cn('compact-radii flex min-h-[100dvh] flex-col bg-background', className)}>
        <BrandHeader
          top={<CoverNav onBack={onBack} meta={meta} />}
          title={title}
          subtitle={subtitle}
          hero={hero}
        />

        <main className="flex flex-1 flex-col px-6 pt-6 pb-6">
          <div className="flex animate-rise flex-col gap-4 [animation-delay:120ms] motion-reduce:animate-none">
            {children}
          </div>
        </main>

        {footerBar}
      </div>
    );
  }

  return (
    <div className={cn('compact-radii flex min-h-[100dvh] flex-col bg-background', className)}>
      <StepHeader
        title={title}
        onBack={onBack}
        meta={meta}
        className="pt-[calc(0.5rem_+_var(--safe-top))] pb-2"
      />

      <main className="flex flex-1 flex-col px-6 pt-4 pb-6">
        {subtitle && <p className="text-[14px]/[1.5] text-muted-foreground">{subtitle}</p>}

        <div className={cn('flex flex-col gap-4', subtitle && 'mt-5')}>{children}</div>
      </main>

      {footerBar}
    </div>
  );
}
