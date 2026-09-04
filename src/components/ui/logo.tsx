import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import logoSupera from '@/assets/logo-supera.png';

// O arquivo é o logotipo oficial recortado no bounding box e com o fundo
// removido, então a proporção (720x209 ≈ 3.44:1) já é a da marca. Só a largura
// é fixada por variante; a altura sai de `h-auto` e nunca é travada, senão o
// logotipo distorce.
//
// Os atributos `width`/`height` abaixo carregam a proporção intrínseca para o
// navegador, que reserva o espaço antes de a imagem baixar — sem eles o texto
// ao redor pula quando ela chega.
const logoVariants = cva('h-auto select-none', {
  variants: {
    size: {
      sm: 'w-[120px]',
      md: 'w-[168px]',
      lg: 'w-[240px]',
    },
  },
  defaultVariants: { size: 'md' },
});

export interface LogoProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'width' | 'height'>,
    VariantProps<typeof logoVariants> {}

export default function Logo({ size, className, ...rest }: LogoProps) {
  return (
    <img
      src={logoSupera}
      alt="Supera Oncologia"
      width={720}
      height={209}
      className={cn(logoVariants({ size }), className)}
      {...rest}
    />
  );
}
