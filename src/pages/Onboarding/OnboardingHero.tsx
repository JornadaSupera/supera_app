import type { ComponentType, CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { CareGlyph, PrivacyGlyph, TeamGlyph, type GlyphProps } from './OnboardingGlyphs';

export type OnboardingHeroVariant = 'care' | 'team' | 'privacy';

const GLYPHS: Record<OnboardingHeroVariant, ComponentType<GlyphProps>> = {
  care: CareGlyph,
  team: TeamGlyph,
  privacy: PrivacyGlyph,
};

interface OnboardingHeroProps {
  variant: OnboardingHeroVariant;
  /** Cor do slide (token). Tinge o halo, os anéis, a órbita e o desenho. */
  tone: string;
  className?: string;
}

/**
 * Ilustração de cada slide do onboarding: um medalhão com o desenho animado no
 * centro, um halo que respira, dois anéis que nascem de trás dele e um ponto em
 * órbita. O movimento é lento e contínuo — quem está começando um tratamento não
 * precisa de uma tela agitada — e todo ele cai para parado com movimento
 * reduzido, com o desenho inteiro.
 *
 * Decorativo: o sentido está no título do slide. O tamanho acompanha a altura da
 * tela, para o texto e os botões caberem em celulares pequenos.
 */
export default function OnboardingHero({ variant, tone, className }: OnboardingHeroProps) {
  const Glyph = GLYPHS[variant];

  return (
    <div
      aria-hidden="true"
      className={cn('relative grid size-[clamp(136px,26dvh,184px)] shrink-0 place-items-center', className)}
      // A cor muda por slide (por isso custom property inline).
      style={{ '--hero-tone': tone } as CSSProperties}
    >
      <span className="absolute inset-[-16%] animate-breathe rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--hero-tone)_24%,transparent),transparent)] motion-reduce:animate-none" />

      {/* Atraso NEGATIVO no segundo anel: ele já nasce no meio do ciclo. Com atraso
          positivo ele ficaria parado, visível e inteiro, até o atraso acabar. Sem
          movimento, o segundo some — empilhado no primeiro, dobraria a borda. */}
      {[0, -2.4].map((delay) => (
        <span
          key={delay}
          className={cn(
            'absolute inset-0 animate-radar-ring rounded-full border border-[color-mix(in_srgb,var(--hero-tone)_50%,transparent)] motion-reduce:animate-none',
            delay !== 0 && 'motion-reduce:hidden'
          )}
          style={{ animationDelay: `${delay}s` }}
        />
      ))}

      <span className="absolute inset-[-6%] animate-orbit motion-reduce:animate-none">
        <span className="absolute top-0 left-1/2 size-2 -translate-x-1/2 rounded-full bg-[var(--hero-tone)]" />
        <span className="absolute bottom-0 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-[color-mix(in_srgb,var(--hero-tone)_45%,transparent)]" />
      </span>

      <div className="relative grid size-[74%] animate-pop place-items-center rounded-full border border-border bg-card shadow-md motion-reduce:animate-none">
        <Glyph className="size-[76%] text-[var(--hero-tone)]" />
      </div>
    </div>
  );
}
