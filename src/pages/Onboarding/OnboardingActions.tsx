import { useEffect, useRef } from 'react';
import { cva } from 'class-variance-authority';
import { ChevronLeft } from 'lucide-react';
import StickyFooter from '../../components/ui/sticky-footer';
import { cn } from '../../lib/utils';

interface OnboardingActionsProps {
  /** Há um slide antes deste: o "Voltar" só existe a partir do segundo. */
  canGoBack: boolean;
  isLastSlide: boolean;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
}

// Os dois botões de navegação do carrossel, no mesmo tamanho e no mesmo raio
// (56 px de altura: a ação principal da tela merece mais que os 44 px do
// padrão, sem sair da regra do alvo de toque).
//
// O botão principal tem corpo com profundidade — um degradê curto do verde da
// marca para uma sombra dele mesmo, uma luz difusa no canto de cima, um filete
// de luz no alto (`--color-highlight`) e um brilho da cor embaixo — em vez de um
// retângulo chapado. O "Voltar" é o mesmo corpo em versão discreta: fundo e
// borda tingidos com a cor da marca, para parecer da mesma família e não um
// botão cinza solto.
//
// O degradê escurece em direção ao texto do tema (`--color-foreground`), não ao
// preto: no tema claro aprofunda o fundo sob o texto claro, e no escuro clareia
// o fundo sob o texto escuro — o contraste melhora nos dois.
const navButtonVariants = cva(
  'inline-flex h-14 cursor-pointer items-center justify-center rounded-xl transition-[scale,background-color,border-color,filter] duration-150 ease-[ease] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)] motion-reduce:transition-none motion-reduce:active:scale-100',
  {
    variants: {
      kind: {
        back: 'w-14 shrink-0 animate-pop border border-[color-mix(in_srgb,var(--color-primary)_28%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-primary)_8%,var(--color-card))] text-[var(--color-supera-seguranca)] shadow-sm hover:bg-[color-mix(in_srgb,var(--color-primary)_15%,var(--color-card))] motion-reduce:animate-none',
        primary:
          'relative flex-1 overflow-hidden border-none bg-[radial-gradient(120%_140%_at_18%_-10%,color-mix(in_srgb,var(--color-highlight)_22%,transparent),transparent_55%),linear-gradient(180deg,var(--color-primary),color-mix(in_srgb,var(--color-primary)_84%,var(--color-foreground)))] px-6 text-[16px] font-semibold tracking-[0.01em] text-primary-foreground shadow-[inset_0_1px_0_0_color-mix(in_srgb,var(--color-highlight)_28%,transparent),0_12px_24px_-12px_color-mix(in_srgb,var(--color-primary)_75%,transparent)] hover:brightness-[0.96]',
      },
    },
  }
);

/**
 * Rodapé do carrossel: voltar e seguir. Não há "Já tenho conta": toda saída
 * do onboarding já leva ao login (pedido de 25/09), e o botão seria repetido.
 *
 * Só no último slide ("Começar") um reflexo atravessa o botão UMA vez, ao
 * aparecer: o único momento de destaque da tela, sem nada piscando depois. Sem
 * seta: o texto fica no centro exato.
 */
export default function OnboardingActions({
  canGoBack,
  isLastSlide,
  onBack,
  onNext,
  onFinish,
}: OnboardingActionsProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const hadBack = useRef(canGoBack);

  // Voltar do 2º para o 1º slide tira o "Voltar" da tela enquanto ele tem o
  // foco, e o foco cairia no início da página (teclado e leitor de tela perdem
  // o lugar). Nesse caso ele passa para o botão principal.
  useEffect(() => {
    if (hadBack.current && !canGoBack && document.activeElement === document.body) {
      primaryRef.current?.focus();
    }
    hadBack.current = canGoBack;
  }, [canGoBack]);

  return (
    <StickyFooter className="flex items-stretch gap-3">
      {canGoBack && (
        <button type="button" aria-label="Voltar" onClick={onBack} className={cn(navButtonVariants({ kind: 'back' }))}>
          <ChevronLeft size={22} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}

      <button
        ref={primaryRef}
        type="button"
        onClick={isLastSlide ? onFinish : onNext}
        className={cn(navButtonVariants({ kind: 'primary' }))}
      >
        {isLastSlide ? 'Começar' : 'Continuar'}
        {isLastSlide && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-sheen bg-linear-to-r from-transparent via-[color-mix(in_srgb,var(--color-highlight)_50%,transparent)] to-transparent motion-reduce:hidden"
          />
        )}
      </button>
    </StickyFooter>
  );
}
