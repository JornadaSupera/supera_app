import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, TouchEvent } from 'react';
import { useNavigate } from 'react-router';
import BrandCover from '../../components/ui/brand-cover';
import IconHeading from '../../components/ui/icon-heading';
import Logo from '../../components/ui/logo';
import OnboardingActions from './OnboardingActions';
import OnboardingHero, { type OnboardingHeroVariant } from './OnboardingHero';
import { useClinicPresentation } from '../../hooks/useClinic';
import { cn } from '../../lib/utils';
import type { ClinicPresentation } from '../../types';

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

/** O texto embutido: o que aparece enquanto a clínica não escreve os dela no painel. */
const BUILT_IN_SLIDES: SlideData[] = [
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

const SWIPE_THRESHOLD = 50;

/**
 * Os slides da clínica (`get_clinic_presentation`), quando ela escreveu algum,
 * com as ilustrações do app na mesma ordem — o slide do banco traz só título e
 * texto. Sem slide da clínica, o texto embutido.
 */
function resolveSlides(presentation: ClinicPresentation | undefined): SlideData[] {
  if (!presentation?.slides.length) return BUILT_IN_SLIDES;

  return presentation.slides.map((slide, index) => {
    const { hero, tone } = BUILT_IN_SLIDES[index % BUILT_IN_SLIDES.length];
    return { hero, tone, title: slide.title, description: slide.body };
  });
}

interface CoverLogoProps {
  /** O logotipo que a clínica subiu no painel, ou `null` para o da marca. */
  clinicLogoUrl: string | null;
}

/**
 * O logotipo no alto da capa. O da clínica vai num selo branco: a imagem vem
 * do painel com as cores que ela tiver, e sobre o verde poderia sumir. Se não
 * carregar, volta o da marca.
 */
function CoverLogo({ clinicLogoUrl }: CoverLogoProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!clinicLogoUrl || failedUrl === clinicLogoUrl) {
    return <Logo size="sm" tone="inverse" />;
  }

  return (
    <span className="inline-flex h-10 items-center rounded-xl bg-[var(--color-on-brand-cover)] px-3 py-1.5">
      <img
        src={clinicLogoUrl}
        alt="Logotipo da clínica"
        className="h-full w-auto max-w-[140px] object-contain"
        onError={() => setFailedUrl(clinicLogoUrl)}
      />
    </span>
  );
}

interface SlideEnterProps {
  direction: 1 | -1;
  children: ReactNode;
  className?: string;
}

/** Passado este tempo a entrada (280ms) já acabou; a classe sai e fica o estado final. */
const SLIDE_ENTER_SETTLE_MS = 400;

// Entrada do slide: fade + 40px de deslocamento, 280ms (`animate-slide-enter`,
// em `index.css`). Quem usa remonta o componente a cada troca de slide
// (key={slideIndex}), e a animação roda de novo em toda navegação.
//
// Antes o estado final esperava dois `requestAnimationFrame`, e sem quadro
// (WebView voltando do segundo plano, navegador sem janela) o slide ficava
// invisível para sempre. Agora: (1) a animação é CSS e o fim dela é o estado
// natural da tela — com movimento reduzido nem há animação; (2) sem quadros, a
// animação também para no primeiro, que é o invisível, então um temporizador
// (que corre mesmo sem quadros) tira a classe depois da duração dela.
//
// São duas entradas por slide — o medalhão, na capa, e o texto, embaixo —, que
// entram juntas: a capa em si fica parada, só o conteúdo dela troca.
function SlideEnter({ direction, children, className }: SlideEnterProps) {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), SLIDE_ENTER_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className={cn(!settled && 'motion-safe:animate-slide-enter', className)}
      // O lado de onde o slide entra depende da direção em que a pessoa andou,
      // calculada em runtime — vai numa custom property que a animação lê.
      style={{ '--slide-from': direction === 1 ? '40px' : '-40px' } as CSSProperties}
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

  // A apresentação da clínica vale quando chega antes de a pessoa sair do
  // primeiro slide (a abertura já a busca). Chegando depois, o carrossel fica
  // com o que estava na tela: trocar o texto enquanto ela lê seria pior.
  const { data: presentation } = useClinicPresentation();
  const [shownPresentation, setShownPresentation] = useState(presentation);
  if (presentation !== shownPresentation && slideIndex === 0) {
    setShownPresentation(presentation);
  }

  const slides = resolveSlides(shownPresentation);
  const lastSlideIndex = slides.length - 1;
  const isLastSlide = slideIndex >= lastSlideIndex;
  const slide = slides[Math.min(slideIndex, lastSlideIndex)];

  function goToNext() {
    setDirection(1);
    setSlideIndex((current) => Math.min(current + 1, lastSlideIndex));
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

    if (deltaX < -SWIPE_THRESHOLD && slideIndex < lastSlideIndex) {
      goToNext();
    } else if (deltaX > SWIPE_THRESHOLD && slideIndex > 0) {
      goToPrev();
    }
  }

  return (
    <div className="compact-radii flex min-h-[100dvh] flex-col bg-background">
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
            <CoverLogo clinicLogoUrl={shownPresentation?.logoUrl ?? null} />
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
        {slides.map((_, index) => (
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
