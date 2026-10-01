import { useEffect, useRef } from 'react';
import { cva } from 'class-variance-authority';
import { ChevronLeft } from 'lucide-react';
import Button from '../../components/ui/button';
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
// (56 px de altura). O principal é o `Button` da marca (`variant="brand"`), o
// mesmo do "Entrar" do login. O "Voltar" é esse corpo em versão discreta: fundo
// e borda tingidos com a cor da marca, para parecer da mesma família e não um
// botão cinza solto.
const backButtonVariants = cva(
  'inline-flex h-14 w-14 shrink-0 animate-pop cursor-pointer items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--color-primary)_28%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-primary)_8%,var(--color-card))] text-[var(--color-supera-seguranca)] shadow-sm transition-[scale,background-color,border-color] duration-150 ease-[ease] hover:bg-[color-mix(in_srgb,var(--color-primary)_15%,var(--color-card))] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)] motion-reduce:animate-none motion-reduce:transition-none motion-reduce:active:scale-100'
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
        <button type="button" aria-label="Voltar" onClick={onBack} className={cn(backButtonVariants())}>
          <ChevronLeft size={22} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}

      <Button
        ref={primaryRef}
        variant="brand"
        size="xl"
        sheen={isLastSlide}
        className="flex-1"
        onClick={isLastSlide ? onFinish : onNext}
      >
        {isLastSlide ? 'Começar' : 'Continuar'}
      </Button>
    </StickyFooter>
  );
}
