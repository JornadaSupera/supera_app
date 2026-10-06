import { Link } from 'react-router';
import { Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatQuestionCount,
  getKnowledgeCategoryPath,
} from '../../utils/knowledgeCenter';
import type { KnowledgeCategorySummary } from '../../types';

/**
 * Cartão de um tema na tela inicial: o card de destaque do guia (branco, fio
 * claro, 20 px de canto e a sombra dos cards), o ícone do tema no verde escuro
 * — sem pastilha, para o cartão respirar —, o nome e a quantidade de
 * perguntas. Ao toque, encolhe de leve e a borda verdeia.
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

  return (
    <Link
      to={getKnowledgeCategoryPath(category.id)}
      className={cn(
        'flex min-h-[76px] items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm',
        'min-[340px]:h-full min-[340px]:min-h-[112px] min-[340px]:flex-col min-[340px]:items-start',
        'transition-[border-color,scale] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'hover:border-[color-mix(in_srgb,var(--color-primary-deep)_35%,var(--color-border))]',
        'active:scale-[0.98] motion-reduce:active:scale-100'
      )}
    >
      {/* Decorativo: o nome do tema vem escrito logo abaixo. */}
      {/* O círculo do modelo do guia no lugar do desenho de cada tema. */}
      <Circle size={24} strokeWidth={2} className="shrink-0 text-primary-deep" aria-hidden="true" />

      <span className="flex min-w-0 flex-col gap-0.5">
        {/* Última defesa, com o texto do aparelho muito aumentado: quebrar a
            palavra (com hífen, onde o navegador souber hifenizar pt-BR) em vez
            de passar da borda. */}
        <span className="text-body font-bold break-words hyphens-auto text-foreground">
          {category.label}
        </span>
        <span className="text-caption font-medium text-muted-foreground">
          {formatQuestionCount(category.questionCount)}
        </span>
      </span>
    </Link>
  );
}
