import { useEffect, useRef, useState } from 'react';
import type { TouchEvent } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight, HeartPulse, ShieldCheck, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Button from '../../components/ui/button';
import IconHeading from '../../components/ui/icon-heading';
import { cn } from '../../lib/utils';

interface SlideData {
  icon: LucideIcon;
  iconTone: string;
  title: string;
  description: string;
}

const SLIDES: SlideData[] = [
  {
    icon: HeartPulse,
    iconTone: 'var(--color-supera-empatia)',
    title: 'Acompanhe seu tratamento\nem um só lugar',
    description:
      'Diário de sintomas, agenda, orientações e chat direto com a equipe. Tudo na palma da sua mão, no seu tempo.',
  },
  {
    icon: Users,
    iconTone: 'var(--color-primary)',
    title: 'Sua equipe enxerga\ncomo você está',
    description:
      'Cada registro que você faz chega organizado para a equipe certa. Eles podem te orientar antes mesmo da próxima consulta.',
  },
  {
    icon: ShieldCheck,
    iconTone: 'var(--color-supera-uniao)',
    title: 'Seus dados são\nseus, sempre',
    description:
      'Tudo aqui é confidencial, protegido por lei (LGPD) e hospedado no Brasil. Você pode exportar ou apagar quando quiser.',
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
  const Icon = slide.icon;

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
      className="w-full transition-[opacity,transform] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
      // translateX/opacity dependem da direção do slide e do estado "entrou
      // no viewport", calculados em runtime — o Tailwind não expressa isso
      // como classe estática.
      style={{
        opacity: entered ? 1 : 0,
        transform: entered ? 'translateX(0)' : `translateX(${offsetX}px)`,
      }}
    >
      <IconHeading
        icon={Icon}
        iconTone={slide.iconTone}
        title={slide.title}
        description={slide.description}
        align="center"
        size="lg"
      />
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

  function handleSkip() {
    navigate('/login');
  }

  function handleFinish() {
    navigate('/login');
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
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <div className="flex justify-end px-6 pt-6">
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

      <footer className="sticky bottom-0 border-t border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] px-6 py-4 backdrop-blur-[8px]">
        {isLastSlide ? (
          <div className="flex items-stretch gap-2">
            <Button variant="outline" iconLeft={ChevronLeft} onClick={goToPrev}>
              Voltar
            </Button>
            <Button className="flex-1" iconRight={ChevronRight} onClick={handleFinish}>
              Entrar
            </Button>
          </div>
        ) : (
          <Button fullWidth iconRight={ChevronRight} onClick={goToNext}>
            Continuar
          </Button>
        )}
      </footer>
    </div>
  );
}
