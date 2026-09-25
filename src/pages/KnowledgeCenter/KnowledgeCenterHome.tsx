import { useDeferredValue, useMemo, useRef, type ReactNode } from 'react';
import { Search, SearchX } from 'lucide-react';
import Input from '../../components/ui/input';
import NavigationRow from '../../components/ui/navigation-row';
import Skeleton from '../../components/ui/skeleton';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import { AlertIcon, ManualIcon } from '../../components/KnowledgeIcons';
import KnowledgeCategoryCard from './KnowledgeCategoryCard';
import KnowledgeScreen from './KnowledgeScreen';
import KnowledgeCategoryIcon from './KnowledgeCategoryIcon';
import SectionHeading from '../../components/ui/section-heading';
import { useKnowledgeCategories, useKnowledgeSearchIndex } from '../../hooks/useKnowledgeCenter';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import { useKnowledgeSearchStore } from '../../stores/knowledgeSearchStore';
import {
  ALERT_QUESTION,
  filterKnowledgeQuestions,
  formatSearchResultCount,
  getKnowledgeQuestionPath,
  normalizeSearchText,
} from '../../utils/knowledgeCenter';
import type { KnowledgeSearchEntry } from '../../types';

/** Quantos cartões o carregamento desenha: o tamanho típico da grade. */
const SKELETON_CARDS = 6;

/** Carregamento com a forma da grade de temas. */
function CategoryGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3.5 min-[340px]:grid-cols-2" aria-busy="true" aria-label="Carregando os temas">
      {Array.from({ length: SKELETON_CARDS }, (_, index) => (
        <Skeleton key={index} className="h-[76px] w-full rounded-xl min-[340px]:h-[112px]" />
      ))}
    </div>
  );
}

/** A capa: o manual da Supera, com o título da tela. */
function HomeCover() {
  return (
    // A padronagem do "S" já dá a textura da capa: nada de desenho grande atrás
    // do título.
    <div className="flex flex-col gap-3 pt-4">
      <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--color-brand-cover-deep)] py-1.5 pr-3.5 pl-2 text-[12.5px] font-semibold ring-1 ring-[color-mix(in_srgb,var(--color-on-brand-cover)_22%,transparent)] ring-inset">
        <ManualIcon className="size-[18px]" />
        Manual do Paciente Quimioterápico
      </span>
      <h1 className="text-[30px]/[1.08] font-bold tracking-[-0.9px] text-balance">Central de Conhecimento</h1>
      <p className="max-w-[30ch] text-[15px]/[1.5]">
        Orientações importantes sobre o seu tratamento, em perguntas e respostas organizadas por tema.
      </p>
    </div>
  );
}

/**
 * Resultado da busca em todos os temas: quem procura "febre" não sabe que a
 * resposta está em "Cuidados gerais". Cada resultado abre o tema com a
 * pergunta já aberta.
 */
function SearchResults({ results, isPending, isError, onRetry, onClear }: SearchResultsProps) {
  if (isPending) {
    return (
      <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Buscando">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-[68px] w-full rounded-[20px]" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <ErrorState className="min-h-0 py-10" title="Não foi possível buscar" onRetry={onRetry} />;
  }

  if (results.length === 0) {
    return (
      <EmptyState
        className="min-h-0 py-10"
        icon={SearchX}
        title="Nenhuma pergunta encontrada"
        description="Tente outra palavra, ou limpe a busca para ver todos os temas."
        actionLabel="Limpar busca"
        onAction={onClear}
      />
    );
  }

  return (
    <ul role="list" className="flex flex-col gap-2.5">
      {results.map((entry) => (
        <li key={entry.id}>
          <NavigationRow
            to={getKnowledgeQuestionPath(entry.categoryId, entry.id)}
            surface="raised"
            density="compact"
            leading={<KnowledgeCategoryIcon categoryId={entry.categoryId} size="sm" />}
            title={entry.question}
            description={entry.categoryLabel}
          />
        </li>
      ))}
    </ul>
  );
}

interface SearchResultsProps {
  results: KnowledgeSearchEntry[];
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  onClear: () => void;
}

/**
 * Central de Conhecimento: a capa do manual, o atalho para os sinais de
 * alerta, a busca em todos os temas e os temas em cartões.
 */
export default function KnowledgeCenterHome() {
  const goBack = useGoBackOr('/perfil');
  const { data: categories, isPending, isError, refetch } = useKnowledgeCategories();
  const searchIndex = useKnowledgeSearchIndex();

  const query = useKnowledgeSearchStore((state) => state.query);
  const setQuery = useKnowledgeSearchStore((state) => state.setQuery);
  const searchRef = useRef<HTMLInputElement>(null);
  // O campo responde a cada tecla; os resultados vêm logo depois.
  const deferredQuery = useDeferredValue(query);
  const isSearching = normalizeSearchText(deferredQuery) !== '';
  const results = useMemo(
    () => (isSearching ? filterKnowledgeQuestions(searchIndex.data ?? [], deferredQuery) : []),
    [isSearching, searchIndex.data, deferredQuery]
  );

  function clearSearch() {
    setQuery('');
    searchRef.current?.focus();
  }

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
        icon={SearchX}
        title="Nenhum tema publicado"
        description="Os conteúdos sobre o tratamento aparecem aqui assim que a clínica os publicar."
      />
    );
  } else {
    topics = (
      // Uma coluna abaixo de 340 px (ver `KnowledgeCategoryCard`). Todos os
      // cartões com a mesma largura, mesmo em número ímpar de temas.
      <ul role="list" className="grid grid-cols-1 gap-3.5 min-[340px]:grid-cols-2">
        {categories.map((category) => (
          <li key={category.id}>
            <KnowledgeCategoryCard category={category} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <KnowledgeScreen onBack={goBack} cover={<HomeCover />}>
      {/* Como no folheto: faixa avermelhada, o triângulo no vermelho cheio e o
          texto num vermelho mais fechado. Sem pastilha e sem linha de apoio —
          o aviso tem de ser lido de relance. */}
      <NavigationRow
        to={getKnowledgeQuestionPath(ALERT_QUESTION.categoryId, ALERT_QUESTION.questionId)}
        density="compact"
        tone="alert"
        leading={<AlertIcon className="size-5 shrink-0 text-destructive" />}
        title="Quando procurar o hospital"
      />

      <Input
        ref={searchRef}
        type="search"
        surface="pill"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        // Os resultados já aparecem enquanto se digita: a tecla "Buscar" do
        // teclado só o fecha, para deixar a lista à vista.
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        placeholder="Buscar em todos os temas"
        aria-label="Buscar pergunta em todos os temas"
        enterKeyHint="search"
        iconLeft={Search}
      />

      {/* Sempre montado, e só o texto muda: um aviso que já nasce preenchido
          não é lido pelo leitor de tela. */}
      <p className="sr-only" aria-live="polite">
        {isSearching && !searchIndex.isPending ? formatSearchResultCount(results.length) : ''}
      </p>

      {isSearching ? (
        <SearchResults
          results={results}
          isPending={searchIndex.isPending}
          isError={searchIndex.isError}
          onRetry={() => void searchIndex.refetch()}
          onClear={clearSearch}
        />
      ) : (
        <section aria-labelledby="knowledge-topics-title" aria-busy={isPending} className="flex flex-col gap-3">
          <SectionHeading id="knowledge-topics-title">Temas</SectionHeading>
          {topics}
        </section>
      )}

      <p className="px-1 text-[12px]/[1.5] text-muted-foreground">
        Conteúdo do Manual do Paciente Quimioterápico e do folheto do cateter da Supera Oncologia.
      </p>
    </KnowledgeScreen>
  );
}
