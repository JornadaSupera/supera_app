import { useEffect, useRef, useState } from 'react';
import type { TouchEvent } from 'react';
import { useNavigate } from 'react-router';
import IconHeading from '../../components/ui/icon-heading';
import OnboardingActions from './OnboardingActions';
import OnboardingHero, { type OnboardingHeroVariant } from './OnboardingHero';
import { cn } from '../../lib/utils';
import { useDevicePreferencesStore } from '../../stores/devicePreferencesStore';

/** Onde começa o primeiro acesso do paciente: o cadastro, que já traz o aceite dos termos. */
const FIRST_ACCESS_PATH = '/cadastro';

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

interface SlideProps {
  slide: SlideData;
  direction: 1 | -1;
}

// Reproduz a animação de entrada que antes vinha de `@keyframes` no CSS
// Module (fade + translateX de 40px, 280ms, cubic-bezier(0.22,1,0.36,1)).
// Tailwind não tem como declarar keyframes numa classe utilitária, então o
// estado "antes/depois" do paint é controlado aqui e a transição CSS faz o
// resto. Como o componente é remontado a cada troca de slide (key={slideIndex}
// no chamador), o efeito roda de novo em toda navegação — igual ao original.
function Slide({ slide, direction }: SlideProps) {
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
      className="flex w-full flex-col items-center gap-8 transition-[opacity,transform] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
      // translateX/opacity dependem da direção do slide e do estado "entrou
      // no viewport", calculados em runtime — o Tailwind não expressa isso
      // como classe estática.
      style={{
        opacity: entered ? 1 : 0,
        transform: entered ? 'translateX(0)' : `translateX(${offsetX}px)`,
      }}
    >
      <OnboardingHero variant={slide.hero} tone={slide.tone} />
      <IconHeading title={slide.title} description={slide.description} align="center" size="lg" />
    </div>
  );
}

export default function OnboardingCarousel() {
  const [slideIndex, setSlideIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const navigate = useNavigate();
  const touchStartX = useRef(0);
  const markOnboardingSeen = useDevicePreferencesStore((state) => state.markOnboardingSeen);

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

  // Qualquer saída conta como "já viu": na próxima abertura sem sessão, a
  // Splash leva direto ao login. "Pular" e o botão do último slide começam o
  // primeiro acesso; quem já tem conta usa o botão do rodapé.
  function leaveTo(path: string) {
    markOnboardingSeen();
    navigate(path);
  }

  function handleSkip() {
    leaveTo(FIRST_ACCESS_PATH);
  }

  function handleFinish() {
    leaveTo(FIRST_ACCESS_PATH);
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
      <div className="flex justify-end px-6 pt-[calc(1.5rem_+_var(--safe-top))]">
        <button
          type="button"
          // padding/margin negativos ampliam a área de toque sem deslocar o
          // texto visualmente — mesmo truque do link "Esqueci minha senha"
          // no Login. Hover fica fora de `hover:` (que no Tailwind v4 só
          // dispara dentro de `@media (hover:hover)`) para preservar o
          // comportamento incondicional do `:hover` do CSS original.
          className="-mx-3 -my-4 cursor-pointer border-none bg-transparent px-3 py-4 text-[12px] text-muted-foreground transition-colors duration-150 ease-[ease] hover:text-foreground"
          onClick={handleSkip}
        >
          Pular
        </button>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden px-6 [touch-action:pan-y]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <Slide key={slideIndex} slide={slide} direction={direction} />
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
        onFinish={handleFinish}
        onHasAccount={() => leaveTo('/login')}
      />
    </div>
  );
}
