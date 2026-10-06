import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import gardenFooter from '@/assets/design/garden-footer.webp';
import gardenCorner from '@/assets/design/garden-corner.webp';

const gardenVariants = cva('pointer-events-none shrink-0 overflow-hidden', {
  variants: {
    kind: {
      /** "jardim-rodape": a faixa de ponta a ponta no pé da tela. */
      band: '',
      /** "jardim-canto": as flores crescendo no canto de baixo, à direita. */
      corner: 'flex justify-end',
    },
  },
});

export interface GardenPaintingProps extends VariantProps<typeof gardenVariants> {
  kind: 'band' | 'corner';
  /** A altura (e a posição) vêm de quem usa: a pintura ocupa o invólucro. */
  className?: string;
}

/**
 * As pinturas de chão do guia da clínica ("DecoracaoPaginas"): sempre na
 * borda de baixo, decorativas (`alt` vazio, fora do leitor de tela) e nunca
 * atrás de texto ou de botão — quem usa reserva o lugar delas. A faixa corta
 * as pontas da pintura (`object-cover`) para caber na altura pedida; o canto
 * mantém a proporção. No tema escuro, `painting-ground` (`index.css`) dissolve
 * o alto da aquarela. `max-w-none!`: o reset global de `img` (`max-width:
 * 100%`, fora de camada) venceria o utilitário comum.
 */
export default function GardenPainting({ kind, className }: GardenPaintingProps) {
  return (
    <div aria-hidden="true" className={cn(gardenVariants({ kind }), className)}>
      {kind === 'band' ? (
        <img
          src={gardenFooter}
          alt=""
          width={1600}
          height={450}
          className="painting-ground h-full w-full max-w-none! object-cover object-bottom select-none"
        />
      ) : (
        <img
          src={gardenCorner}
          alt=""
          width={560}
          height={562}
          className="painting-ground h-full w-auto max-w-none! select-none"
        />
      )}
    </div>
  );
}
