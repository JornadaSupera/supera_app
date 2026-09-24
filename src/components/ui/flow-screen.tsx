import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
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
  children?: ReactNode;
  className?: string;
}

/**
 * Moldura das telas de um fluxo de entrada (cadastro, confirmação do
 * celular): barra com o título ao lado do voltar, uma frase, o conteúdo, e a
 * ação fixa no rodapé.
 *
 * O topo é enxuto de propósito — o título mora na barra (que assim não fica
 * só com uma seta) e o corpo começa direto na frase, sem ícone grande nem
 * título repetido, para o primeiro campo aparecer sem rolar. Entre o texto e o
 * conteúdo há 20px, e entre as ações do rodapé, 12px: botão colado no texto é
 * o defeito que esta moldura existe para evitar.
 *
 * Os raios de borda são menores só aqui: as variáveis são redefinidas na
 * própria moldura, então botões, campos e caixas de marcação dentro dela
 * herdam o valor sem que o resto do app mude.
 */
export default function FlowScreen({
  title,
  subtitle,
  meta,
  onBack,
  footer,
  children,
  className,
}: FlowScreenProps) {
  return (
    <div
      className={cn(
        'flex min-h-[100dvh] flex-col bg-background [--radius-lg:8px] [--radius-xl:10px] [--radius-2xl:12px]',
        className
      )}
    >
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

      {footer && <StickyFooter className="flex flex-col gap-3">{footer}</StickyFooter>}
    </div>
  );
}
