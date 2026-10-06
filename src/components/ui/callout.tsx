import { useId } from 'react';
import { cn } from '@/lib/utils';

export interface CalloutProps {
  /** Título curto do bloco (ex.: "Antes da sua consulta"). */
  title: string;
  /** De 2 a 6 itens, cada um uma ação que começa pelo verbo. */
  items: string[];
  className?: string;
}

/**
 * A caixa de destaque do guia da clínica ("CaixaDestaque"): o box verde-água
 * de orientações da caderneta e do Manual, com instruções práticas em lista.
 * Fundo `surface-teal`, raio de 20, título em `teal-deep` e itens em `ink`.
 *
 * É a caixa informativa (orientações, detalhes de compromisso). Lembrete e
 * preparo (exames, retorno, limpeza do cateter) vão no laranja — `orange-soft`
 * com `orange-deep` —, não aqui.
 *
 * O marcador é um ponto desenhado, centrado na primeira linha (9 px abaixo do
 * topo da linha de 24 px do `text-body`): o reset global do `index.css` tira o
 * `list-style` e o recuo das listas. `role="list"` porque o Safari deixa de
 * anunciar como lista uma `ul` sem `list-style`.
 */
export default function Callout({ title, items, className }: CalloutProps) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className={cn('flex flex-col gap-3 rounded-2xl bg-secondary p-6', className)}
    >
      <h3 id={titleId} className="text-card-title font-bold text-primary-deep">
        {title}
      </h3>

      <ul role="list" className="flex flex-col gap-2">
        {items.map((item, index) => (
          <li key={`${index}-${item}`} className="flex gap-2.5 text-body text-foreground">
            <span aria-hidden="true" className="mt-[9px] size-1.5 shrink-0 rounded-full bg-primary-deep" />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
