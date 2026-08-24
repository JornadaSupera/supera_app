import { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { HeartPulse, Users, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '../../components/Button';
import IconHeading from '../../components/IconHeading';
import { cx } from '../../utils/classNames';
import styles from './OnboardingCarousel.module.css';

const SLIDES = [
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

export default function OnboardingCarousel() {
  const [slideIndex, setSlideIndex] = useState(0);
  const [direction, setDirection] = useState(1);
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
    navigate('/onboarding/lgpd');
  }

  function handleFinish() {
    navigate('/onboarding/lgpd');
  }

  function handleTouchStart(event) {
    touchStartX.current = event.touches[0].clientX;
  }

  function handleTouchEnd(event) {
    const deltaX = event.changedTouches[0].clientX - touchStartX.current;

    if (deltaX < -SWIPE_THRESHOLD && slideIndex < LAST_SLIDE_INDEX) {
      goToNext();
    } else if (deltaX > SWIPE_THRESHOLD && slideIndex > 0) {
      goToPrev();
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button type="button" className={styles.skipButton} onClick={handleSkip}>
          Pular
        </button>
      </div>

      <div
        className={styles.slideArea}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          key={slideIndex}
          className={cx(styles.slide, direction === 1 ? styles.slideFromRight : styles.slideFromLeft)}
        >
          <IconHeading
            icon={slide.icon}
            iconTone={slide.iconTone}
            title={slide.title}
            description={slide.description}
            align="center"
            size="lg"
          />
        </div>
      </div>

      <div className={styles.dots}>
        {SLIDES.map((_, index) => (
          <span
            key={index}
            className={cx(styles.dot, index === slideIndex && styles.dotActive)}
          />
        ))}
      </div>

      <footer className={styles.footer}>
        {isLastSlide ? (
          <div className={styles.actionsRow}>
            <Button variant="outline" iconLeft={ChevronLeft} onClick={goToPrev}>
              Voltar
            </Button>
            <Button
              fullWidth
              iconRight={ChevronRight}
              onClick={handleFinish}
              style={{ flex: 1 }}
            >
              Criar minha conta
            </Button>
          </div>
        ) : (
          <Button fullWidth iconRight={ChevronRight} onClick={goToNext}>
            Continuar
          </Button>
        )}

        <p className={styles.loginHint}>
          Já tem conta?{' '}
          <Link to="/login" className={styles.loginLink}>
            Entrar
          </Link>
        </p>
      </footer>
    </div>
  );
}
