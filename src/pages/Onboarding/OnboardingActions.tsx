import { useEffect, useRef } from 'react';
import { cva } from 'class-variance-authority';
import { ChevronLeft } from 'lucide-react';
import Button from '../../components/ui/button';
import { cn } from '../../lib/utils';

interface OnboardingActionsProps {
  /** Há um slide antes deste: o "Voltar" só existe a partir do segundo. */
  canGoBack: boolean;
  isLastSlide: boolean;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
}

// Os dois botões de navegação do carrossel, pelo pacote de design da clínica
// (03/10/2026): 48 px de altura e cantos de 14 px. O principal é o `Button` da
// marca (`variant="brand"`): o verde da marca chapado, com o texto escuro. O
// "Voltar" é um quadrado de 48 px só com o contorno no verde escuro.
const backButtonVariants = cva(
  'inline-flex h-12 w-12 shrink-0 animate-pop cursor-pointer items-center justify-center rounded-[14px] border-2 border-primary-deep bg-transparent text-primary-deep transition-[scale,background-color] duration-150 ease-[ease] hover:bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)] motion-reduce:animate-none motion-reduce:transition-none motion-reduce:active:scale-100'
);

/**
 * Os botões do carrossel: voltar e seguir. Ficam no mesmo lugar nos três
 * slides (quem posiciona é o carrossel). Não há "Já tenho conta": toda saída
 * do onboarding já leva ao login (pedido de 25/09), e o botão seria repetido.
 *
 * O botão é chapado, sem reflexo: o modelo da introdução pede "sem degradê".
 * Sem seta: o texto fica no centro exato.
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
    <div className="flex items-stretch gap-3">
      {canGoBack && (
        <button type="button" aria-label="Voltar" onClick={onBack} className={cn(backButtonVariants())}>
          <ChevronLeft size={22} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}

      <Button
        ref={primaryRef}
        variant="brand"
        size="lg"
        className="flex-1 rounded-[14px]"
        onClick={isLastSlide ? onFinish : onNext}
      >
        {isLastSlide ? 'Começar' : 'Continuar'}
      </Button>
    </div>
  );
}
