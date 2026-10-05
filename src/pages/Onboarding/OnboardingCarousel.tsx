import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, TouchEvent } from 'react';
import { useNavigate } from 'react-router';
import IconHeading from '../../components/ui/icon-heading';
import ElevatorDoors from './ElevatorDoors';
import OnboardingActions from './OnboardingActions';
import { useClinicPresentation } from '../../hooks/useClinic';
import { cn } from '../../lib/utils';
import type { ClinicPresentation } from '../../types';
import receptionSlats from '../../assets/design/reception-slats.webp';
import receptionPlanter from '../../assets/design/reception-planter.webp';
import superaS from '../../assets/design/supera-s.png';

/**
 * Para onde o onboarding sai: o login, a porta única (pedido de 25/09). Quem
 * ainda não tem conta segue de lá para o cadastro, com o e-mail já digitado.
 */
const SIGN_IN_PATH = '/login';

interface SlideData {
  title: string;
  description: string;
}

/** O texto embutido: o que aparece enquanto a clínica não escreve os dela no painel. */
const BUILT_IN_SLIDES: SlideData[] = [
  {
    title: 'Acompanhe seu tratamento\nem um só lugar',
    description:
      'Diário de sintomas, agenda, orientações e chat direto com a equipe. Tudo na palma da sua mão, no seu tempo.',
  },
  {
    title: 'Sua equipe enxerga\ncomo você está',
    description:
      'Cada registro que você faz chega organizado para a equipe certa. Eles podem te orientar antes mesmo da próxima consulta.',
  },
  {
    title: 'Seus dados são\nseus, sempre',
    description:
      'Tudo aqui é confidencial, protegido por lei (LGPD) e hospedado no Brasil. Você pode pedir a exportação ou a exclusão dos seus dados.',
  },
];

const SWIPE_THRESHOLD = 50;

/**
 * Os slides da clínica (`get_clinic_presentation`), quando ela escreveu algum.
 * Sem slide da clínica, o texto embutido.
 */
function resolveSlides(presentation: ClinicPresentation | undefined): SlideData[] {
  if (!presentation?.slides.length) return BUILT_IN_SLIDES;

  return presentation.slides.map((slide) => ({ title: slide.title, description: slide.body }));
}

interface ReceptionMarkProps {
  /** O logotipo que a clínica subiu no painel, ou `null` para o "S" da marca. */
  clinicLogoUrl: string | null;
}

/**
 * A marca no canto de baixo do ripado, como o "S" da lateral do balcão da
 * recepção: o "S" verde do pacote de design, sem recolorir. Se a clínica subiu
 * um logotipo no painel, ele vai no mesmo lugar, num selo branco — a imagem
 * vem com as cores que ela tiver, e sobre a madeira poderia sumir. Se não
 * carregar, volta o "S".
 */
function ReceptionMark({ clinicLogoUrl }: ReceptionMarkProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!clinicLogoUrl || failedUrl === clinicLogoUrl) {
    return (
      <img
        src={superaS}
        alt="Supera Oncologia"
        width={530}
        height={550}
        className="absolute top-[61%] left-[5%] h-[32%] w-auto drop-shadow-[0_1px_1px_color-mix(in_srgb,var(--color-on-brand-cover)_55%,transparent)]"
      />
    );
  }

  return (
    <span className="absolute top-[58%] left-[5%] inline-flex h-10 items-center rounded-xl bg-card px-3 py-1.5 shadow-sm">
      <img
        src={clinicLogoUrl}
        alt="Logotipo da clínica"
        className="h-full w-auto max-w-[140px] object-contain"
        onError={() => setFailedUrl(clinicLogoUrl)}
      />
    </span>
  );
}

/**
 * O ripado de madeira do balcão da recepção, encostado no alto e de ponta a
 * ponta. A pintura tem uma faixa transparente embaixo das ripas: a caixa a
 * corta (proporção 1600 × 700), e o que vem depois começa logo abaixo das
 * pontas arredondadas, sem cortá-las.
 */
function ReceptionSlats({ clinicLogoUrl }: ReceptionMarkProps) {
  return (
    <div className="relative bleed-x aspect-[1600/700] shrink-0 overflow-hidden">
      <img
        src={receptionSlats}
        alt=""
        width={1600}
        height={784}
        className="absolute inset-x-0 top-0 h-auto w-full"
      />
      <ReceptionMark clinicLogoUrl={clinicLogoUrl} />
    </div>
  );
}

/**
 * O canteiro da recepção (versão A, "leve"), encostado na borda de baixo e
 * centralizado, com 167% da largura da tela — as sobras saem pelos lados. Ocupa
 * o espaço que sobra abaixo dos botões, então o alto das plantas nunca encosta
 * neles: em tela baixa, o canteiro encolhe até a largura da tela e, depois
 * disso, perde o alto das folhas, mas a base de madeira fica inteira.
 *
 * A altura natural é 71% da largura (`71cqw`: 167% da largura × 680/1600), e
 * `max-h-full` a limita ao espaço que sobra; a largura acompanha a altura
 * (`w-auto`) até a largura da tela (`min-w-full`). O contêiner mede só a
 * largura (`inline-size`): com `size`, o `cqh` de um item flexível sem altura
 * fixa vale zero no Chrome. `max-w-none!`: o reset global de `img`
 * (`max-width: 100%`, fora de camada) venceria o utilitário comum.
 */
function ReceptionPlanter() {
  return (
    <div
      aria-hidden="true"
      className="relative bleed-x mt-6 min-h-[88px] flex-1 overflow-hidden [container-type:inline-size]"
    >
      <img
        src={receptionPlanter}
        alt=""
        width={1600}
        height={680}
        className="absolute bottom-0 left-1/2 h-[71cqw] max-h-full w-auto min-w-full max-w-none! -translate-x-1/2 object-cover object-bottom"
      />
    </div>
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
// Só o texto entra: o ripado e o canteiro ficam parados entre um slide e outro.
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

  // A chegada à recepção da clínica (pacote de design de 03/10/2026): o ripado
  // do balcão no alto, o canteiro embaixo e, entre os dois, o texto que muda.
  // Nada de texto por cima das pinturas.
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/* O ripado e o texto respondem ao deslizar; os botões de baixo, não. */}
      <div className="flex flex-col [touch-action:pan-y]" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <ReceptionSlats clinicLogoUrl={shownPresentation?.logoUrl ?? null} />

        <div className="flex flex-col px-6">
          <div className="flex justify-end">
            <button
              type="button"
              // padding/margin negativos ampliam a área de toque sem deslocar o
              // texto visualmente — mesmo truque do link "Esqueci minha senha"
              // no Login.
              className="-mx-3 min-h-[44px] cursor-pointer border-none bg-transparent px-3 py-2.5 text-[15px] font-semibold text-primary-deep"
              onClick={goToSignIn}
            >
              Pular
            </button>
          </div>

          {/* Altura reservada para o texto mais longo dos três (medida em 320 e
              em 360 px de largura): os pontos e os botões ficam na mesma posição
              nos três slides, sem subir nem descer com o tamanho do texto. */}
          <div className="min-h-[13.5rem] min-[360px]:min-h-[11rem]">
            <SlideEnter key={slideIndex} direction={direction}>
              <IconHeading title={slide.title} description={slide.description} align="left" size="lg" />
            </SlideEnter>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5 px-6">
        <div className="flex items-center gap-[7px]">
          {slides.map((_, index) => (
            <span
              key={index}
              className={cn(
                'h-[7px] w-[7px] rounded-full bg-[color-mix(in_srgb,var(--color-muted-foreground)_40%,transparent)] transition-all duration-200 ease-[ease]',
                index === slideIndex && 'w-6 bg-primary-deep'
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

      <ReceptionPlanter />

      <ElevatorDoors />
    </div>
  );
}
