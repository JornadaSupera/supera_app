import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import {
  formatQuestionCount,
  getKnowledgeCategoryAppearance,
  getKnowledgeCategoryPath,
} from '../../utils/knowledgeCenter';
import type { KnowledgeCategorySummary } from '../../types';

/**
 * Cartão de um tema na tela inicial: branco, com o traço fino da borda, o ícone
 * do tema no verde da marca — sem pastilha, para o cartão respirar —, o nome e
 * a quantidade de perguntas. Ao toque, encolhe de leve e a borda verdeia.
 *
 * A linha de apoio ("O que é, como surge…") saiu daqui: ela continua na capa do
 * tema, onde há espaço para lê-la. Aqui o nome já diz o bastante, e o cartão
 * curto deixa a grade inteira à vista sem rolar.
 *
 * A partir de 340 px a grade tem duas colunas e o cartão fica em pé, com o
 * ícone sobre o nome. Abaixo disso — celular pequeno ou tela ampliada nos
 * ajustes do aparelho — "Medicamentos" não cabe numa coluna estreita: a grade
 * vira uma coluna só e o cartão deita (ícone ao lado do nome). O limite é o
 * mesmo da grade em `KnowledgeCenterHome`.
 */
export default function KnowledgeCategoryCard({ category }: { category: KnowledgeCategorySummary }) {
  const { icon: Icon } = getKnowledgeCategoryAppearance(category.id);

  return (
    <Link
      to={getKnowledgeCategoryPath(category.id)}
      className={cn(
        'flex min-h-[76px] items-center gap-3.5 rounded-xl border border-border bg-card p-4 shadow-sm',
        'min-[340px]:h-full min-[340px]:min-h-[112px] min-[340px]:flex-col min-[340px]:items-start min-[340px]:gap-3',
        'transition-[border-color,box-shadow,scale] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'hover:border-[color-mix(in_srgb,var(--color-primary)_35%,var(--color-border))] hover:shadow-md',
        'active:scale-[0.98] motion-reduce:active:scale-100'
      )}
    >
      {/* Decorativo: o nome do tema vem escrito logo abaixo. */}
      <Icon className="size-6 text-[var(--color-supera-seguranca)]" />

      <span className="flex min-w-0 flex-col gap-0.5">
        {/* Última defesa, com o texto do aparelho muito aumentado: quebrar a
            palavra (com hífen, onde o navegador souber hifenizar pt-BR) em vez
            de passar da borda. */}
        <span className="text-[15px]/[1.25] font-semibold tracking-[-0.2px] break-words hyphens-auto text-foreground">
          {category.label}
        </span>
        <span className="text-[12.5px] text-muted-foreground">
          {formatQuestionCount(category.questionCount)}
        </span>
      </span>
    </Link>
  );
}
