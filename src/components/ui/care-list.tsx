import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CareListItem {
  /** Uma instrução curta, começando pelo verbo. */
  text: string;
  /** Letra ou número do passo (A, B, C do folheto). Sem ele, vai o triângulo. */
  step?: string;
}

export interface CareListProps {
  /** De 2 a 8 cuidados. */
  items: CareListItem[];
  className?: string;
}

/**
 * A grade de cuidados do guia da clínica ("ListaCuidados"), vinda do folheto
 * do cateter: cada item com o triângulo de atenção em `teal-deep` (traço de
 * 2 px) e a frase em `ink`. Para passos em sequência, a letra do passo entra
 * no lugar do triângulo.
 *
 * A atenção aqui é verde-água, não vermelha: são cuidados de rotina. Sinal que
 * exige procurar atendimento vai no `UrgentAlert`.
 *
 * Uma ou duas colunas conforme a largura (no mínimo 220 px cada), sem painel
 * de fundo. `role="list"` porque o Safari deixa de anunciar como lista uma
 * `ul` sem `list-style` (o reset global do `index.css` tira o marcador).
 */
export default function CareList({ items, className }: CareListProps) {
  return (
    <ul
      role="list"
      className={cn('grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 gap-y-4', className)}
    >
      {items.map(({ text, step }, index) => (
        <li
          key={`${index}-${text}`}
          className="flex items-start gap-3 text-body font-medium text-foreground"
        >
          {step ? (
            // A letra no `text-hero` com a entrelinha da frase (24 px): as duas
            // linhas começam juntas no `items-start`.
            <span className="w-6 flex-none text-hero/6 font-bold text-primary-deep">
              {step}
            </span>
          ) : (
            <TriangleAlert size={26} strokeWidth={2} aria-hidden="true" className="shrink-0 text-primary-deep" />
          )}
          <span className="min-w-0">{text}</span>
        </li>
      ))}
    </ul>
  );
}
