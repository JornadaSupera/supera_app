import type { ReactNode, SVGProps } from 'react';

// Ícones da Central de Conhecimento, desenhados para o app em duas camadas: o
// traço em `currentColor` e um preenchimento na mesma cor, mais claro. Ficam
// bons sobre a pastilha verde da marca (ícone branco) e sobre fundo claro
// (ícone verde). Grade de 24 × 24, traço de 1,7 com pontas arredondadas.
//
// Decorativos: o nome do tema está sempre escrito ao lado. Quem usa não passa
// texto alternativo (`aria-hidden`).

export interface KnowledgeIconProps {
  className?: string;
}

export type KnowledgeIcon = (props: KnowledgeIconProps) => ReactNode;

/** Opacidade da camada de fundo de cada ícone. */
const TINT = 0.3;

function IconFrame({ className, children }: KnowledgeIconProps & { children: ReactNode }) {
  const props: SVGProps<SVGSVGElement> = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
    className,
  };
  return <svg {...props}>{children}</svg>;
}

/** Sobre o câncer: o laço da conscientização. */
export function RibbonIcon({ className }: KnowledgeIconProps) {
  return (
    <IconFrame className={className}>
      <path
        d="M12 3.5a3.9 3.9 0 0 0-3.9 3.9c0 1.6.9 3.5 2.2 5.4L12 15.2l1.7-2.4c1.3-1.9 2.2-3.8 2.2-5.4A3.9 3.9 0 0 0 12 3.5Z"
        fill="currentColor"
        fillOpacity={TINT}
        stroke="none"
      />
      <path d="M7.4 20.6C9.7 18 15.9 11.5 15.9 7.4a3.9 3.9 0 0 0-7.8 0c0 4.1 6.2 10.6 8.5 13.2" />
    </IconFrame>
  );
}

/** Quimioterapia: a bolsa de soro com o equipo e a gota. */
export function InfusionIcon({ className }: KnowledgeIconProps) {
  return (
    <IconFrame className={className}>
      <path d="M9.2 2.8h5.6" />
      <path
        d="M7.2 10.4h9.6v2.4a2.6 2.6 0 0 1-2.6 2.6H9.8a2.6 2.6 0 0 1-2.6-2.6Z"
        fill="currentColor"
        fillOpacity={TINT}
        stroke="none"
      />
      <rect x="7" y="4.4" width="10" height="11" rx="2.6" />
      <path d="M10 7.4h2.6" strokeOpacity={0.75} />
      <path d="M12 15.4v2.3" />
      <path d="M12 18.6c-.9 1.1-1.3 1.8-1.3 2.3a1.3 1.3 0 0 0 2.6 0c0-.5-.4-1.2-1.3-2.3Z" fill="currentColor" />
    </IconFrame>
  );
}

/** Cateter (Portocath): o reservatório sob a pele e o tubo que segue pela veia. */
export function CatheterPortIcon({ className }: KnowledgeIconProps) {
  return (
    <IconFrame className={className}>
      <path
        d="M3 5.6c3.7-1.8 7.3-1.8 10.6 0 2.8 1.5 5.2 1.5 7.4.4v3.1c-2.2 1.1-4.6 1.1-7.4-.4C10.3 6.9 6.7 6.9 3 8.7Z"
        fill="currentColor"
        fillOpacity={TINT}
        stroke="none"
      />
      <path d="M3 5.6c3.7-1.8 7.3-1.8 10.6 0 2.8 1.5 5.2 1.5 7.4.4" strokeOpacity={0.7} />
      <path d="M9.9 13.6c1.6-1.6 2.7-3.7 3.2-6.2" />
      <circle cx="8.3" cy="16.4" r="4.2" fill="currentColor" fillOpacity={TINT} />
      <circle cx="8.3" cy="16.4" r="1.7" fill="currentColor" />
    </IconFrame>
  );
}

/** Medicamentos: a cápsula e o comprimido. */
export function PillsIcon({ className }: KnowledgeIconProps) {
  return (
    <IconFrame className={className}>
      <path
        d="M4.9 13.4 8 10.3l5.5 5.5-3.1 3.1a3.9 3.9 0 0 1-5.5-5.5Z"
        fill="currentColor"
        fillOpacity={TINT}
        stroke="none"
      />
      <path d="M4.9 13.4 11 7.3a3.9 3.9 0 0 1 5.5 5.5l-6.1 6.1a3.9 3.9 0 0 1-5.5-5.5Z" />
      <path d="m8 10.3 5.5 5.5" />
      <circle cx="18.1" cy="18.2" r="2.8" fill="currentColor" fillOpacity={TINT} />
      <path d="M16.2 20 20 16.4" strokeOpacity={0.8} />
    </IconFrame>
  );
}

/** Efeitos colaterais: o curativo. */
export function BandageIcon({ className }: KnowledgeIconProps) {
  return (
    <IconFrame className={className}>
      <rect
        x="2.6"
        y="8.6"
        width="18.8"
        height="6.8"
        rx="3.4"
        transform="rotate(-40 12 12)"
        fill="currentColor"
        fillOpacity={0.2}
      />
      <rect
        x="8.6"
        y="8.9"
        width="6.8"
        height="6.2"
        rx="1.2"
        transform="rotate(-40 12 12)"
        fill="currentColor"
        fillOpacity={0.45}
        stroke="none"
      />
      <path d="M11 11.2h.01M13 12.8h.01M11.6 13.6h.01M12.4 10.4h.01" strokeWidth={2.2} />
    </IconFrame>
  );
}

/** Sexualidade: dois corações. */
export function HeartsIcon({ className }: KnowledgeIconProps) {
  return (
    <IconFrame className={className}>
      <path
        d="M9.2 20C5.1 17.3 2.8 14.8 2.8 11.8a3.5 3.5 0 0 1 6.4-2 3.5 3.5 0 0 1 6.4 2c0 3-2.3 5.5-6.4 8.2Z"
        fill="currentColor"
        fillOpacity={TINT}
      />
      <path
        d="M17.6 10.6c-2.3-1.5-3.6-3-3.6-4.7a2 2 0 0 1 3.6-1.2 2 2 0 0 1 3.6 1.2c0 1.7-1.3 3.2-3.6 4.7Z"
        strokeOpacity={0.85}
      />
    </IconFrame>
  );
}

/** Cuidados gerais: a casa com o coração (cuidados no dia a dia, em casa). */
export function HomeCareIcon({ className }: KnowledgeIconProps) {
  return (
    <IconFrame className={className}>
      <path d="M5.6 8.9v9.3a2 2 0 0 0 2 2h8.8a2 2 0 0 0 2-2V8.9" fill="currentColor" fillOpacity={0.2} />
      <path d="M3.6 10.4 12 3.6l8.4 6.8" />
      <path
        d="M12 17.4c-2.1-1.4-3.2-2.6-3.2-4a1.7 1.7 0 0 1 3.2-.8 1.7 1.7 0 0 1 3.2.8c0 1.4-1.1 2.6-3.2 4Z"
        fill="currentColor"
      />
    </IconFrame>
  );
}

/** O manual: o livro aberto com o marcador. */
export function ManualIcon({ className }: KnowledgeIconProps) {
  return (
    <IconFrame className={className}>
      <path d="M12 6.6c-1.9-1.4-4.6-2-7.8-1.8v12.8c3.2-.2 5.9.4 7.8 1.8" fill="currentColor" fillOpacity={0.2} />
      <path d="M12 6.6c1.9-1.4 4.6-2 7.8-1.8v12.8c-3.2-.2-5.9.4-7.8 1.8Z" fill="currentColor" fillOpacity={0.4} />
      <path d="M12 6.6v12.8" />
      <path d="M6.6 9.2c1.2 0 2.3.2 3.3.6M6.6 12.2c1.2 0 2.3.2 3.3.6" strokeOpacity={0.75} />
      <path d="M15.6 4.9v5.2l1.4-1 1.4 1V4.8" fill="currentColor" strokeWidth={1.4} />
    </IconFrame>
  );
}

/** Sinais de alerta. */
export function AlertIcon({ className }: KnowledgeIconProps) {
  return (
    <IconFrame className={className}>
      <path
        d="M10.3 4.3a2 2 0 0 1 3.4 0l7.4 12.8a2 2 0 0 1-1.7 3H4.6a2 2 0 0 1-1.7-3Z"
        fill="currentColor"
        fillOpacity={0.22}
      />
      <path d="M12 9.3v4.4" />
      <path d="M12 16.9h.01" strokeWidth={2.4} />
    </IconFrame>
  );
}
