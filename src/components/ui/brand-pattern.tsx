import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * O "S" da Supera com a seta no alto, em contorno — o desenho do papel de
 * parede e da capa do manual impresso. Caixa de 100 × 132.
 *
 * É um redesenho: a curva do "S" foi feita por uma linha central suave com a
 * seta na ponta, e o contorno calculado a partir dela. Se a clínica enviar o
 * vetor original da padronagem, basta trocar este traçado.
 */
const GLYPH =
  'M47.3 12L45.7 13.1L44.2 13.9L42.3 14.8L40.1 15.7L37.5 16.6L34.8 17.6L31.9 18.7L28.8 19.9L25.6 21.3L22.4 22.9L19.1 24.9L15.9 27.4L12.9 30.4L10.2 34.1L8 38.3L6.6 43L5.9 48L6.1 53.2L7.1 58.3L9 62.9L11.8 67L15.1 70.3L18.7 72.8L22.4 74.8L26.1 76.2L29.8 77.4L33.5 78.2L37.2 78.9L40.8 79.5L44.3 80L47.8 80.5L51.1 81L54.2 81.5L57.2 82.1L59.8 82.7L62 83.3L64.7 84.4L66.8 85.5L68.4 86.7L69.7 87.8L70.6 88.9L71.2 89.9L71.5 90.8L71.7 91.6L71.8 92.4L71.7 93.1L71.5 93.8L71.1 94.6L70.4 95.5L69.5 96.5L68.2 97.5L66.4 98.5L64.1 99.5L61.2 100.3L59.4 100.6L56.9 100.9L54.2 101.2L51.4 101.5L48.4 101.7L45.3 101.9L42.1 102L38.9 102.1L35.6 102.1L32.3 102.2L28.9 102.2L25.5 102.1L22.2 102.1L18.9 102.1L15.6 102.1L12.3 102L9.1 102L6 102L6 126L9 126L12.1 126L15.3 126.1L18.6 126.1L22 126.1L25.4 126.1L28.9 126.2L32.4 126.2L35.9 126.1L39.4 126.1L42.9 126L46.4 125.8L49.8 125.7L53.2 125.4L56.6 125.1L59.9 124.8L63.1 124.3L66.8 123.7L72 122.2L77 120.1L81.5 117.5L85.5 114.4L88.9 110.8L91.7 106.8L93.9 102.5L95.2 97.9L95.7 93.1L95.5 88.4L94.5 83.7L92.7 79.3L90.2 75.1L87.2 71.4L83.5 68L79.4 65.1L74.8 62.6L70 60.7L66 59.5L62.2 58.6L58.4 57.9L54.7 57.3L51.1 56.7L47.7 56.3L44.4 55.8L41.3 55.3L38.5 54.8L36 54.2L33.9 53.6L32.3 52.9L31.1 52.3L30.5 51.9L30.2 51.6L30.1 51.5L30.1 51.3L29.9 50.8L29.9 49.1L30.1 48L30.3 47.2L30.6 46.7L31 46.2L31.6 45.5L32.7 44.7L34.1 43.9L35.9 43L38 42.1L40.4 41.1L43 40.2L45.8 39.2L48.7 38.1L51.8 36.9L54.9 35.4L58 33.7L60.7 32L42.9 5.4L69.8 11.5L65.1 38.6Z';

/**
 * Ladrilho da padronagem: duas colunas de "S", a segunda meia altura abaixo,
 * como no papel de parede. A cópia em `-TILE_H / 2` completa a segunda coluna
 * na emenda de cima do ladrilho.
 */
const TILE_WIDTH = 200;
const TILE_HEIGHT = 168;
const COPIES = [
  [0, 0],
  [100, TILE_HEIGHT / 2],
  [100, -TILE_HEIGHT / 2],
] as const;

/** Espessura da linha na tela, em px, qualquer que seja a escala. */
const LINE_WIDTH_PX = 1.1;

export interface BrandPatternProps {
  /** Tamanho do "S": 1 = 132 px de altura. */
  scale?: number;
  /** A cor da linha vem de `currentColor` (`text-*`). */
  className?: string;
}

/**
 * A padronagem da Supera, que preenche o elemento pai (posicionado). É
 * decorativa: fora da leitura de tela e dos toques.
 */
export default function BrandPattern({ scale = 0.4, className }: BrandPatternProps) {
  // O `useId` do React traz `:` e `«»`, que não servem dentro de `url(#...)`.
  const patternId = `brand-pattern-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
    >
      <defs>
        <pattern
          id={patternId}
          width={TILE_WIDTH}
          height={TILE_HEIGHT}
          patternUnits="userSpaceOnUse"
          patternTransform={`scale(${scale})`}
        >
          {COPIES.map(([x, y]) => (
            <path
              key={`${x},${y}`}
              d={GLYPH}
              transform={`translate(${x} ${y})`}
              fill="none"
              stroke="currentColor"
              strokeWidth={LINE_WIDTH_PX / scale}
              strokeLinejoin="round"
            />
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
