import OnboardingHero, { type OnboardingHeroVariant } from './OnboardingHero';

/** Os desenhos das telas de entrada fora do carrossel. */
export type EntryHeroVariant = Exclude<OnboardingHeroVariant, 'care' | 'team' | 'privacy'>;

interface EntryHeroProps {
  variant: EntryHeroVariant;
}

/**
 * O medalhão do onboarding na capa do login, da recuperação de senha e do
 * cadastro (`BrandHeader`): menor que o dos slides, com o desenho no verde de
 * texto da marca e o movimento em volta em branco. O tamanho acompanha a
 * largura, nunca a altura da tela — no Android o teclado encolhe a tela.
 */
export default function EntryHero({ variant }: EntryHeroProps) {
  return (
    <OnboardingHero
      variant={variant}
      tone="var(--color-supera-seguranca)"
      surface="cover"
      className="size-[clamp(84px,26vw,112px)]"
    />
  );
}
