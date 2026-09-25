import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import {
  formatQuestionCount,
  getKnowledgeCategoryAppearance,
  getKnowledgeCategoryPath,
} from '../../utils/knowledgeCenter';
import type { KnowledgeCategorySummary } from '../../types';

/**
 * Cartão de um tema na tela inicial: ícone na cor do tema, nome e quantas
 * perguntas tem.
 *
 * A partir de 340 px a grade tem duas colunas e o cartão fica em pé (ícone em
 * cima). Abaixo disso — celular pequeno ou tela ampliada nos ajustes do
 * aparelho — "Medicamentos" não cabe numa coluna estreita: a grade vira uma
 * coluna só e o cartão deita (ícone ao lado do nome). O limite é o mesmo da
 * grade em `KnowledgeCenterHome`.
 */
export default function KnowledgeCategoryCard({ category }: { category: KnowledgeCategorySummary }) {
  const { icon: Icon, tone } = getKnowledgeCategoryAppearance(category.id);

  return (
    <Link
      to={getKnowledgeCategoryPath(category.id)}
      // Exceção deliberada ao "nunca style inline": a cor varia por tema e não
      // há classe estática para ela — mesmo padrão de `--icon-tone` em
      // empty-state.tsx e icon-heading.tsx. O valor é sempre um token.
      style={{ '--tone': tone } as CSSProperties}
      className={cn(
        'flex min-h-[72px] items-center gap-3 rounded-xl border border-border bg-card p-4',
        'min-[340px]:h-full min-[340px]:min-h-[116px] min-[340px]:flex-col min-[340px]:items-start min-[340px]:justify-between min-[340px]:gap-4',
        'transition-[border-color,box-shadow] duration-200 ease-[ease]',
        'hover:border-[color-mix(in_srgb,var(--tone)_40%,var(--color-border))] hover:shadow-sm'
      )}
    >
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--tone)_14%,transparent)] text-[var(--tone)]">
        <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        {/* Última defesa, com o texto do aparelho muito aumentado: quebrar a
            palavra (com hífen, onde o navegador souber hifenizar pt-BR) em vez
            de passar da borda. */}
        <span className="text-[15px]/[1.3] font-semibold break-words hyphens-auto text-foreground">
          {category.label}
        </span>
        <span className="text-[13px]/[1.4] text-muted-foreground">
          {formatQuestionCount(category.questionCount)}
        </span>
      </span>
    </Link>
  );
}
