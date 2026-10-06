import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * O "S" da Supera com a seta no alto — o VETOR ORIGINAL da marca, tirado do
 * pacote de design que a clínica aprovou em 03/10/2026 (`padrao-S-*.svg`). O
 * redesenho anterior tinha a seta diferente do original, e a clínica pediu a
 * troca. Contorno fechado da silhueta: com `fill` vira o "S" cheio do selo,
 * com `stroke`, a linha fina da padronagem. Caixa de 132,61 × 136,46.
 */
export const BRAND_S_PATH =
  'M1.42 97.36L47.89 92.96L48.84 92.88L49.16 93.78C50.09 96.45 51.19 98.73 52.46 100.62C53.71 102.46 55.14 103.93 56.74 105.02L56.74 105.03C58.35 106.14 60.24 106.98 62.4 107.54C64.58 108.1 67.07 108.38 69.87 108.38C72.9 108.38 75.58 108.06 77.9 107.42C80.17 106.8 82.11 105.86 83.71 104.6L83.74 104.58C84.92 103.71 85.8 102.73 86.39 101.65C86.96 100.58 87.24 99.4 87.24 98.11C87.24 96.67 86.87 95.41 86.13 94.32C85.37 93.19 84.21 92.21 82.65 91.39L82.65 91.39C81.46 90.79 79.23 90.09 75.98 89.31C72.69 88.52 68.32 87.64 62.87 86.68C54.74 85.25 47.83 83.88 42.14 82.56C36.45 81.24 31.99 79.96 28.77 78.72L28.76 78.72C25.49 77.46 22.47 75.78 19.71 73.66C16.96 71.55 14.47 69.02 12.25 66.07L12.25 66.07C9.99 63.09 8.3 59.9 7.17 56.5C6.05 53.1 5.48 49.49 5.48 45.67C5.48 41.52 6.09 37.65 7.31 34.05C8.53 30.44 10.35 27.13 12.78 24.11C14.95 21.39 17.5 18.98 20.42 16.88C22.86 15.12 25.56 13.59 28.52 12.27L16.25 0L64.82 0L64.82 48.57L62.72 46.48L52.56 36.32C51.68 37.06 51.02 37.87 50.57 38.73C50.07 39.68 49.82 40.73 49.82 41.87C49.82 43.13 50.13 44.22 50.75 45.13C51.4 46.08 52.39 46.89 53.73 47.56C55.16 48.28 57.5 48.97 60.73 49.64C64.01 50.32 68.21 50.97 73.35 51.6C81.15 52.48 87.96 53.54 93.79 54.77C99.64 56.01 104.51 57.42 108.36 59.02C112.27 60.63 115.72 62.59 118.71 64.9C121.72 67.22 124.26 69.9 126.33 72.93L126.44 73.07L126.45 73.09C130.67 79.41 132.61 86.31 132.53 93.21C132.44 100.39 130.17 107.57 126.01 114.07C123.82 117.52 120.99 120.61 117.53 123.35C114.09 126.07 110.03 128.43 105.36 130.44C100.68 132.46 95.17 133.96 88.81 134.97C82.49 135.97 75.37 136.46 67.43 136.46C56.21 136.46 46.58 135.66 38.55 134.06C30.46 132.44 23.97 129.99 19.1 126.72C14.24 123.45 10.25 119.49 7.12 114.84C3.99 110.18 1.73 104.85 0.34 98.85L0.03 97.49Z';

/** Caixa do `BRAND_S_PATH`, para o `viewBox` de quem desenha o "S" sozinho. */
export const BRAND_S_VIEWBOX = '0 0 132.61 136.46';

/**
 * O módulo da padronagem, igual ao do arquivo da clínica: duas colunas de
 * "S", a segunda deslocada para baixo, numa caixa de 211,8 × 129 que se
 * repete sem emenda. A terceira cópia completa a segunda coluna na emenda de
 * cima.
 */
const MODULE_WIDTH = 211.8;
const MODULE_HEIGHT = 129;
const S_SCALE = 0.7326;
const COPIES = [
  [4.5, 14.5],
  [110.4, 79],
  [110.4, -50],
] as const;
/** Espessura da linha no módulo, a do arquivo original (antes da escala do "S"). */
const LINE_WIDTH = 1.57;

/**
 * Largura do módulo na tela. O pacote pede de 120 a 130 pt, "uns 6 S por
 * linha" num celular.
 */
const DEFAULT_MODULE_WIDTH_PX = 126;

export interface BrandPatternProps {
  /** Largura do módulo (duas colunas de "S") na tela, em px. */
  moduleWidth?: number;
  /**
   * A cor da linha vem de `currentColor` (`text-*`) e a intensidade, da
   * opacidade (`opacity-*`).
   *
   * Para a padronagem continuar sem emenda de um bloco para o outro (a faixa
   * da barra de status e a capa logo abaixo dela), a origem pode subir pela
   * variável `--brand-pattern-shift`, herdada de quem estiver em volta: a
   * capa que começa 47 px abaixo do topo da tela recebe `47px`, e o desenho
   * dela continua o da faixa.
   */
  className?: string;
}

/**
 * A padronagem da Supera, que preenche o elemento pai (posicionado e com
 * `overflow-hidden`). É decorativa: fora da leitura de tela e dos toques.
 */
export default function BrandPattern({ moduleWidth = DEFAULT_MODULE_WIDTH_PX, className }: BrandPatternProps) {
  // O `useId` do React traz `:` e `«»`, que não servem dentro de `url(#...)`.
  const patternId = `brand-pattern-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const scale = moduleWidth / MODULE_WIDTH;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cn(
        'pointer-events-none absolute inset-x-0 top-[calc(-1_*_var(--brand-pattern-shift,0px))] h-[calc(100%_+_var(--brand-pattern-shift,0px))] w-full',
        className
      )}
    >
      <defs>
        <pattern
          id={patternId}
          width={MODULE_WIDTH}
          height={MODULE_HEIGHT}
          patternUnits="userSpaceOnUse"
          patternTransform={`scale(${scale})`}
        >
          <g fill="none" stroke="currentColor" strokeWidth={LINE_WIDTH} strokeLinejoin="round">
            {COPIES.map(([x, y]) => (
              <path key={`${x},${y}`} d={BRAND_S_PATH} transform={`translate(${x} ${y}) scale(${S_SCALE})`} />
            ))}
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
