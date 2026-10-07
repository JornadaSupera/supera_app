import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import logoSupera from '@/assets/design/logo-supera.png';
import logoSuperaWhite from '@/assets/design/logo-supera-white.png';
import logoSuperaSloganWhite from '@/assets/design/logo-supera-slogan-white.png';

// Os arquivos são os do pacote de design aprovado pela clínica em 03/10/2026:
// o logotipo verde da marca, para fundo claro, e o branco, para a capa verde.
// A logo anterior do app tinha outro verde e o "ONCOLOGIA" em dourado; a
// clínica pediu os originais.
//
// Só a largura é fixada por variante; a altura sai de `h-auto` e nunca é
// travada, senão o logotipo distorce. Os atributos `width`/`height` carregam a
// proporção intrínseca de cada arquivo para o navegador, que reserva o espaço
// antes de a imagem baixar — sem eles o texto ao redor pula quando ela chega.
const logoVariants = cva('h-auto select-none', {
  variants: {
    size: {
      sm: 'w-[120px] max-w-full',
      md: 'w-[168px] max-w-full',
      lg: 'w-[240px] max-w-full',
    },
    // `inverse`: o logotipo branco, para a capa verde da marca (como no
    // folheto e no manual impresso).
    // `slogan`: o branco com o "Sempre ao seu lado!", que o guia pede na
    // abertura (no login ela tirou o slogan em 07/10).
    tone: {
      brand: '',
      inverse: '',
      slogan: '',
    },
  },
  defaultVariants: { size: 'md', tone: 'brand' },
});

const LOGO_FILES = {
  brand: { src: logoSupera, width: 926, height: 220 },
  inverse: { src: logoSuperaWhite, width: 811, height: 192 },
  slogan: { src: logoSuperaSloganWhite, width: 1030, height: 374 },
} as const;

export interface LogoProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'width' | 'height'>,
    VariantProps<typeof logoVariants> {}

export default function Logo({ size, tone, className, ...rest }: LogoProps) {
  const file = LOGO_FILES[tone ?? 'brand'];

  return (
    <img
      src={file.src}
      alt={tone === 'slogan' ? 'Supera Oncologia — Sempre ao seu lado!' : 'Supera Oncologia'}
      width={file.width}
      height={file.height}
      className={cn(logoVariants({ size, tone }), className)}
      {...rest}
    />
  );
}
