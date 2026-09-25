import { useId } from 'react';
import { cn } from '@/lib/utils';

export interface GlyphProps {
  className?: string;
}

/*
 * Os três desenhos do onboarding. São decorativos (quem lê o sentido é o título
 * do slide), então ficam sem texto alternativo — quem os usa põe `aria-hidden`.
 *
 * A cor vem de `currentColor`: o quadro que os envolve define `--hero-tone` e o
 * `text-[var(--hero-tone)]` chega aqui. Os traços têm `pathLength="100"` para as
 * animações de `index.css` (`draw`, `ecg`) valerem para qualquer comprimento.
 * Com movimento reduzido nenhuma animação roda e cada desenho fica inteiro.
 */

// ---------------------------------------------------------------------------
// Acompanhamento: um coração que bate e o traçado que o diário desenha.
// ---------------------------------------------------------------------------

const HEART =
  'M50 82C22 62 14 46 14 34C14 24 22 17 31 17C39 17 46 21 50 28C54 21 61 17 69 17C78 17 86 24 86 34C86 46 78 62 50 82Z';
const ECG = 'M6 52H20Q24 46 28 52H38L42 57L47 27L53 70L57 52H66Q72 42 78 52H94';

export function CareGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={cn('overflow-visible', className)}>
      <g className="animate-heartbeat [transform-box:fill-box] [transform-origin:center] motion-reduce:animate-none">
        <path
          d={HEART}
          pathLength={100}
          fill="currentColor"
          fillOpacity={0.13}
          stroke="currentColor"
          strokeOpacity={0.45}
          strokeWidth={2}
          strokeLinejoin="round"
          className="animate-draw [stroke-dasharray:100] motion-reduce:animate-none"
        />
      </g>
      <path
        d={ECG}
        pathLength={100}
        stroke="currentColor"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-ecg [stroke-dasharray:100] [filter:drop-shadow(0_0_3px_color-mix(in_srgb,currentColor_55%,transparent))] motion-reduce:animate-none"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Equipe: o paciente no centro e o que ele registra correndo até a equipe.
// ---------------------------------------------------------------------------

// Três pontas a 39 do centro. O triângulo fica mais alto que largo, então o
// grupo desce 9 para o desenho ocupar o meio do medalhão.
const TEAM_NODES = [
  { x: 50, y: 11, delay: '0s' },
  { x: 83.8, y: 69.5, delay: '0.9s' },
  { x: 16.2, y: 69.5, delay: '1.8s' },
];

export function TeamGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={cn('overflow-visible', className)}>
      <g transform="translate(0 9)">
        {TEAM_NODES.map((node) => (
          <line
            key={`line-${node.x}`}
            x1={50}
            y1={50}
            x2={node.x}
            y2={node.y}
            stroke="currentColor"
            strokeOpacity={0.7}
            strokeWidth={2.4}
            strokeLinecap="round"
            className="animate-dash-flow [stroke-dasharray:1.5_6.5] motion-reduce:animate-none"
          />
        ))}

        {TEAM_NODES.map((node) => (
          <g key={`node-${node.x}`}>
            <circle
              cx={node.x}
              cy={node.y}
              r={9}
              stroke="currentColor"
              strokeWidth={1.6}
              className="animate-node-pulse [transform-box:fill-box] [transform-origin:center] motion-reduce:animate-none"
              style={{ animationDelay: node.delay }}
            />
            <circle cx={node.x} cy={node.y} r={9} fill="var(--color-card)" stroke="currentColor" strokeWidth={2} />
            <path
              d={`M${node.x - 3.2} ${node.y}H${node.x + 3.2}M${node.x} ${node.y - 3.2}V${node.y + 3.2}`}
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
            />
          </g>
        ))}

        <circle cx={50} cy={50} r={14} fill="currentColor" />
        <circle cx={50} cy={45} r={4.8} fill="var(--color-selected-foreground)" />
        <path d="M41.5 60Q41.5 52 50 52Q58.5 52 58.5 60Z" fill="var(--color-selected-foreground)" />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Privacidade: um escudo que se fecha, com o "certo" por último.
// ---------------------------------------------------------------------------

const SHIELD = 'M50 14L80 25V46C80 66 68 80 50 88C32 80 20 66 20 46V25Z';

export function PrivacyGlyph({ className }: GlyphProps) {
  // `useId` devolve dois-pontos, que quebram `url(#…)`.
  const uid = useId().replace(/:/g, '');
  const clipId = `shield-clip-${uid}`;
  const gradientId = `shield-scan-${uid}`;

  return (
    <svg viewBox="0 0 100 100" fill="none" className={cn('overflow-visible', className)}>
      <defs>
        <clipPath id={clipId}>
          <path d={SHIELD} />
        </clipPath>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity={0} />
          <stop offset="0.5" stopColor="currentColor" stopOpacity={0.32} />
          <stop offset="1" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>

      <path d={SHIELD} fill="currentColor" fillOpacity={0.12} />
      {/* A faixa de luz só existe em movimento: parada, seria uma listra no meio do escudo. */}
      <g clipPath={`url(#${clipId})`}>
        <rect
          x={20}
          y={42}
          width={60}
          height={30}
          fill={`url(#${gradientId})`}
          className="animate-scan opacity-0 motion-reduce:animate-none"
        />
      </g>
      <path
        d={SHIELD}
        pathLength={100}
        stroke="currentColor"
        strokeWidth={3}
        strokeLinejoin="round"
        className="animate-draw [stroke-dasharray:100] motion-reduce:animate-none"
      />
      <path
        d="M36 51L46 61L65 40"
        pathLength={100}
        stroke="currentColor"
        strokeWidth={4.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-draw [stroke-dasharray:100] motion-reduce:animate-none"
        style={{ animationDelay: '0.75s' }}
      />
    </svg>
  );
}
