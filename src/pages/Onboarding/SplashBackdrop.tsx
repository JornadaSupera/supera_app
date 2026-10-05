import type { ReactNode } from 'react';
import BrandPattern from '../../components/ui/brand-pattern';
import { cn } from '../../lib/utils';
import logoSloganWhite from '../../assets/design/logo-supera-slogan-white.png';

interface SplashBackdropProps {
  className?: string;
  children?: ReactNode;
}

/**
 * O fundo da tela inicial (pacote de design de 03/10/2026): a padronagem do
 * "S" no tom "profundo", que some suavemente no centro — um degradê radial da
 * própria cor de fundo — para o logotipo ficar sobre uma área lisa.
 *
 * É o mesmo nas duas metades da "porta de elevador" (`ElevatorDoors`): a
 * padronagem e o degradê se medem pela tela inteira, e as portas continuam o
 * desenho da tela inicial sem emenda.
 */
export function SplashBackdrop({ className, children }: SplashBackdropProps) {
  return (
    <div
      className={cn(
        'isolate overflow-hidden bg-[var(--color-brand-splash)] text-[var(--color-on-brand-cover)]',
        className
      )}
    >
      <BrandPattern className="-z-10 opacity-[var(--brand-splash-pattern-opacity)]" />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_62%_30%_at_50%_50%,var(--color-brand-splash)_0%,var(--color-brand-splash)_55%,transparent_100%)]"
      />
      {children}
    </div>
  );
}

interface SplashLogoProps {
  className?: string;
}

/** O logotipo branco com "Sempre ao seu lado!", com cerca de 64% da largura da tela. */
export function SplashLogo({ className }: SplashLogoProps) {
  return (
    <img
      src={logoSloganWhite}
      alt="Supera Oncologia — Sempre ao seu lado!"
      width={1030}
      height={374}
      className={cn('h-auto w-[64%] max-w-[320px] select-none', className)}
    />
  );
}
