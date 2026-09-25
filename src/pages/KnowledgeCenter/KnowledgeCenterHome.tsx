import type { ReactNode } from 'react';
import { BookOpenText } from 'lucide-react';
import FlowScreen from '../../components/ui/flow-screen';
import Skeleton from '../../components/ui/skeleton';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import KnowledgeCategoryCard from './KnowledgeCategoryCard';
import { useKnowledgeCategories } from '../../hooks/useKnowledgeCenter';
import { useGoBackOr } from '../../hooks/useGoBackOr';

/** Quantos cartões o carregamento desenha: o tamanho típico da grade. */
const SKELETON_CARDS = 6;

/** Carregamento com a forma da grade de temas. */
function CategoryGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 min-[340px]:grid-cols-2" aria-busy="true" aria-label="Carregando os temas">
      {Array.from({ length: SKELETON_CARDS }, (_, index) => (
        <Skeleton key={index} className="h-[72px] w-full rounded-xl min-[340px]:h-[116px]" />
      ))}
    </div>
  );
}

/**
 * Central de Conhecimento: os temas do manual do paciente, em cartões. Cada
 * cartão leva às perguntas do tema.
 */
export default function KnowledgeCenterHome() {
  const goBack = useGoBackOr('/perfil');
  const { data: categories, isPending, isError, refetch } = useKnowledgeCategories();

  let topics: ReactNode;

  if (isPending) {
    topics = <CategoryGridSkeleton />;
  } else if (isError) {
    topics = (
      <ErrorState
        className="min-h-0 py-10"
        title="Não foi possível abrir os temas"
        onRetry={() => void refetch()}
      />
    );
  } else if (categories.length === 0) {
    topics = (
      <EmptyState
        className="min-h-0 py-10"
        icon={BookOpenText}
        title="Nenhum tema publicado"
        description="Os conteúdos sobre o tratamento aparecem aqui assim que a clínica os publicar."
      />
    );
  } else {
    topics = (
      // Uma coluna abaixo de 340 px: ver `KnowledgeCategoryCard`.
      <ul role="list" className="grid grid-cols-1 gap-3 min-[340px]:grid-cols-2">
        {categories.map((category) => (
          <li key={category.id}>
            <KnowledgeCategoryCard category={category} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <FlowScreen title="Central de Conhecimento" onBack={goBack}>
      <div className="flex items-center gap-3.5 rounded-xl border border-[color-mix(in_srgb,var(--color-primary)_22%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-primary)_6%,var(--color-card))] p-4">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--color-primary)_16%,transparent)] text-primary">
          <BookOpenText size={22} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <p className="text-[14px]/[1.5] text-foreground">
          Orientações importantes sobre o seu tratamento, em perguntas e respostas organizadas por tema.
        </p>
      </div>

      <section aria-labelledby="knowledge-topics-title" className="flex flex-col gap-3">
        <h2 id="knowledge-topics-title" className="sr-only">
          Temas
        </h2>
        {topics}
      </section>

      <p className="text-[12px]/[1.5] text-muted-foreground">
        Conteúdo do Manual do Paciente Quimioterápico da Supera Oncologia.
      </p>
    </FlowScreen>
  );
}
