import { useEffect, useRef, useState } from 'react';
import type { ReactNode, TouchEvent } from 'react';
import { useNavigate } from 'react-router';
import BrandCover from '../../components/ui/brand-cover';
import IconHeading from '../../components/ui/icon-heading';
import Logo from '../../components/ui/logo';
import OnboardingActions from './OnboardingActions';
import OnboardingHero, { type OnboardingHeroVariant } from './OnboardingHero';
import { cn } from '../../lib/utils';

/**
 * Para onde o onboarding sai: o login, a porta única (pedido de 25/09). Quem
 * ainda não tem conta segue de lá para o cadastro, com o e-mail já digitado.
 */
const SIGN_IN_PATH = '/login';

interface SlideData {
  hero: OnboardingHeroVariant;
  tone: string;
  title: string;
  description: string;
}

const SLIDES: SlideData[] = [
  {
    hero: 'care',
    tone: 'var(--color-primary)',
    title: 'Acompanhe seu tratamento\nem um só lugar',
    description:
      'Diário de sintomas, agenda, orientações e chat direto com a equipe. Tudo na palma da sua mão, no seu tempo.',
  },
  {
    hero: 'team',
    tone: 'var(--color-supera-empatia)',
    title: 'Sua equipe enxerga\ncomo você está',
    description:
      'Cada registro que você faz chega organizado para a equipe certa. Eles podem te orientar antes mesmo da próxima consulta.',
  },
  {
    hero: 'privacy',
    tone: 'var(--color-supera-seguranca)',
    title: 'Seus dados são\nseus, sempre',
    description:
      'Tudo aqui é confidencial, protegido por lei (LGPD) e hospedado no Brasil. Você pode pedir a exportação ou a exclusão dos seus dados.',
  },
];

const LAST_SLIDE_INDEX = SLIDES.length - 1;
const SWIPE_THRESHOLD = 50;

interface SlideEnterProps {
  direction: 1 | -1;
  children: ReactNode;
  className?: string;
}

// Reproduz a animação de entrada que antes vinha de `@keyframes` no CSS
// Module (fade + translateX de 40px, 280ms, cubic-bezier(0.22,1,0.36,1)).
// Tailwind não tem como declarar keyframes numa classe utilitária, então o
// estado "antes/depois" do paint é controlado aqui e a transição CSS faz o
// resto. Quem usa remonta o componente a cada troca de slide
// (key={slideIndex}), então o efeito roda de novo em toda navegação.
//
// São duas entradas por slide — o medalhão, na capa, e o texto, embaixo —, que
// entram juntas: a capa em si fica parada, só o conteúdo dela troca.
function SlideEnter({ direction, children, className }: SlideEnterProps) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    // Duas rAF: a primeira garante que o navegador já pintou o estado
    // inicial (opacity 0 + deslocado) antes de disparar a transição para o
    // estado final no frame seguinte. Com uma só rAF, WebViews (iOS) podem
    // colapsar as duas atualizações no mesmo frame e a transição não roda.
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, []);

  const offsetX = direction === 1 ? 40 : -40;

  return (
    <div
      className={cn(
        'transition-[opacity,transform] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        className
      )}
      // translateX/opacity dependem da direção do slide e do estado "entrou
      // no viewport", calculados em runtime — o Tailwind não expressa isso
      // como classe estática.
      style={{
        opacity: entered ? 1 : 0,
        transform: entered ? 'translateX(0)' : `translateX(${offsetX}px)`,
      }}
    >
      {children}
    </div>
  );
}

export default function OnboardingCarousel() {
  const [slideIndex, setSlideIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const navigate = useNavigate();
  const touchStartX = useRef(0);

  const isLastSlide = slideIndex === LAST_SLIDE_INDEX;
  const slide = SLIDES[slideIndex];

  function goToNext() {
    setDirection(1);
    setSlideIndex((current) => Math.min(current + 1, LAST_SLIDE_INDEX));
  }

  function goToPrev() {
    setDirection(-1);
    setSlideIndex((current) => Math.max(current - 1, 0));
  }

  // "Pular" e o botão do último slide saem para o mesmo lugar. Empilha, e não
  // substitui: o "voltar" do login devolve aos slides.
  function goToSignIn() {
    navigate(SIGN_IN_PATH);
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.touches[0].clientX;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const deltaX = event.changedTouches[0].clientX - touchStartX.current;

    if (deltaX < -SWIPE_THRESHOLD && slideIndex < LAST_SLIDE_INDEX) {
      goToNext();
    } else if (deltaX > SWIPE_THRESHOLD && slideIndex > 0) {
      goToPrev();
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background [--radius-lg:8px] [--radius-xl:10px] [--radius-2xl:12px]">
      {/* Capa e texto respondem ao deslizar; os botões de baixo, não. */}
      <div
        className="flex flex-1 flex-col [touch-action:pan-y]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* A capa do manual: o verde da Supera com a padronagem do "S", o
            logotipo em branco e o medalhão do slide. A altura acompanha a tela,
            para o texto e os botões caberem num celular pequeno (conferido em
            320 × 568). */}
        <BrandCover
          shape="header"
          patternScale={0.36}
          className="flex h-[clamp(196px,40dvh,400px)] shrink-0 flex-col px-6 pt-[calc(1rem_+_var(--safe-top))] pb-4 [@media(min-height:700px)]:pb-6"
        >
          <div className="flex items-center justify-between gap-4">
            <Logo size="sm" tone="inverse" />
            <button
              type="button"
              // padding/margin negativos ampliam a área de toque sem deslocar o
              // texto visualmente — mesmo truque do link "Esqueci minha senha"
              // no Login.
              className="-mx-3 -my-3 min-h-[44px] cursor-pointer border-none bg-transparent px-3 py-3 text-[13px] font-semibold text-[var(--color-on-brand-cover)]"
              onClick={goToSignIn}
            >
              Pular
            </button>
          </div>

          <div className="flex flex-1 items-center justify-center">
            <SlideEnter key={slideIndex} direction={direction}>
              <OnboardingHero
                variant={slide.hero}
                tone={slide.tone}
                surface="cover"
                // Menor que o padrão: precisa caber na capa, que encolhe em tela baixa.
                className="size-[clamp(108px,21dvh,184px)]"
              />
            </SlideEnter>
          </div>
        </BrandCover>

        <div className="flex flex-1 items-center justify-center overflow-hidden px-6 py-3 [@media(min-height:700px)]:py-6">
          <SlideEnter key={slideIndex} direction={direction} className="w-full">
            <IconHeading title={slide.title} description={slide.description} align="center" size="lg" />
          </SlideEnter>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 pb-6">
        {SLIDES.map((_, index) => (
          <span
            key={index}
            className={cn(
              'h-[6px] w-[6px] rounded-full bg-muted-foreground opacity-30 transition-all duration-200 ease-[ease]',
              index === slideIndex && 'w-6 bg-primary opacity-100'
            )}
          />
        ))}
      </div>

      <OnboardingActions
        canGoBack={slideIndex > 0}
        isLastSlide={isLastSlide}
        onBack={goToPrev}
        onNext={goToNext}
        onFinish={goToSignIn}
      />
    </div>
  );
}
