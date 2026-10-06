import { useId } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface UrgentAlertProps {
  /** A frase de abertura (ex.: "Procure o hospital onde você faz o tratamento se tiver:"). */
  title: string;
  /** Os sinais de alarme, com o texto definido pela equipe clínica. */
  items: string[];
  className?: string;
}

/**
 * O bloco de sinais de alarme do guia da clínica ("AlertaUrgencia"), da página
 * "Procure o hospital…" da caderneta. É o único vermelho do app: fundo
 * `alert-soft`, título e triângulo em `alert`, itens em `ink` seminegrito.
 * Sempre com ícone e texto, nunca só cor, e no máximo um bloco por tela.
 *
 * Sem botões dentro, por decisão do projeto: bloco de alerta não ganha ação
 * nem link novo.
 *
 * Os itens vão em até duas colunas, preenchidas de cima para baixo, como no
 * guia; cada coluna tem pelo menos 8 rem, então em tela estreita (320 px) a
 * lista fica numa coluna só em vez de quebrar cada sinal em três linhas. O
 * marcador é um ponto desenhado, centrado na primeira linha (9 px abaixo do
 * topo da linha de 24 px do `text-body`): o reset global do `index.css` tira o
 * `list-style` das listas.
 *
 * `<section>` com título, e não `role="alert"`: o bloco é conteúdo fixo da
 * tela, e não um aviso que acabou de aparecer.
 */
export default function UrgentAlert({ title, items, className }: UrgentAlertProps) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className={cn('flex flex-col gap-3 rounded-2xl bg-destructive-soft p-6', className)}
    >
      <div className="flex items-start gap-3">
        <TriangleAlert size={28} strokeWidth={2} aria-hidden="true" className="shrink-0 text-destructive" />
        <h3 id={titleId} className="text-card-title font-bold text-destructive">
          {title}
        </h3>
      </div>

      <ul role="list" className="columns-[2_8rem] gap-x-8">
        {items.map((item, index) => (
          <li
            key={`${index}-${item}`}
            className="flex break-inside-avoid gap-2 text-body font-semibold text-foreground"
          >
            <span aria-hidden="true" className="mt-[9px] size-1.5 shrink-0 rounded-full bg-foreground" />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
