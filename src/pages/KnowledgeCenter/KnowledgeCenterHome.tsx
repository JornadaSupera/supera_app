import { useDeferredValue, useMemo, useRef, type ReactNode } from 'react';
import { Search, SearchX, TriangleAlert } from 'lucide-react';
import Input from '../../components/ui/input';
import NavigationRow from '../../components/ui/navigation-row';
import Skeleton from '../../components/ui/skeleton';
import EmptyState from '../../components/ui/empty-state';
import GardenPainting from '../../components/ui/garden-painting';
import KnowledgeSearchEmpty from './KnowledgeSearchEmpty';
import ErrorState from '../../components/ui/error-state';
import KnowledgeCategoryCard from './KnowledgeCategoryCard';
import KnowledgeIntroCard from './KnowledgeIntroCard';
import KnowledgeScreen from './KnowledgeScreen';
import SectionHeading from '../../components/ui/section-heading';
import {
  useKnowledgeCategories,
  useKnowledgeIntro,
  useKnowledgeSearchIndex,
} from '../../hooks/useKnowledgeCenter';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import { useKnowledgeSearchStore } from '../../stores/knowledgeSearchStore';
import {
  ALERT_QUESTION,
  filterKnowledgeQuestions,
  formatSearchResultCount,
  getKnowledgeCategoryAppearance,
  getKnowledgeQuestionPath,
  normalizeSearchText,
} from '../../utils/knowledgeCenter';
import type { KnowledgeSearchEntry } from '../../types';

/** Quantos cartões o carregamento desenha: o tamanho típico da grade. */
const SKELETON_CARDS = 6;

/** Carregamento com a forma da grade de temas. */
function CategoryGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 min-[340px]:grid-cols-2" aria-busy="true" aria-label="Carregando os temas">
      {Array.from({ length: SKELETON_CARDS }, (_, index) => (
        <Skeleton key={index} className="h-[76px] w-full rounded-2xl min-[340px]:h-[112px]" />
      ))}
    </div>
  );
}

/** A capa: o manual da Supera, com o título da tela. */
function HomeCover() {
  return (
    // A padronagem do "S" já dá a textura da capa: nada de desenho grande atrás
    // do título, que tem o tamanho do título de capa do guia ("CabecalhoMarca",
    // `text-hero`, 24/30 em negrito). Do título à linha de apoio, 12 px, como
    // na capa de um tema (`CategoryCover`) e na "Sobre a Supera".
    <div className="flex flex-col gap-1 pt-1">
      <h1 className="text-hero font-bold text-balance">Central de Conhecimento</h1>
      <p className="max-w-[30ch] text-body-sm">
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
      // A altura de um resultado com a pergunta numa linha só (75 px): o fio
      // de 1 px e os 12 px de cada lado, a linha de 24 px do título, 4 px e a
      // de 21 px do tema.
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Buscando">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-[75px] w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <ErrorState className="min-h-0 py-10" title="Não foi possível buscar" onRetry={onRetry} />;
  }

  if (results.length === 0) {
    return (
      <KnowledgeSearchEmpty showAllLabel="Ver todos os temas" onShowAll={onClear} />
    );
  }

  return (
    // 8 px entre as linhas, como entre as de um mesmo grupo no guia.
    <ul role="list" className="flex flex-col gap-2">
      {results.map((entry) => {
        // O ícone do tema solto, no verde escuro, como nos cartões dos temas.
        const { icon: Icon } = getKnowledgeCategoryAppearance(entry.categoryId);
        return (
          <li key={entry.id}>
            <NavigationRow
              to={getKnowledgeQuestionPath(entry.categoryId, entry.id)}
              surface="raised"
              density="compact"
              leading={<Icon className="size-6 shrink-0 text-primary-deep" />}
              title={entry.question}
              description={entry.categoryLabel}
            />
          </li>
        );
      })}
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
  const intro = useKnowledgeIntro();

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
      // cartões com a mesma largura, mesmo em número ímpar de temas, e 12 px
      // entre eles, como na grade de assuntos do Chat.
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
    <KnowledgeScreen onBack={goBack} cover={<HomeCover />}>
      {/* Como o bloco de alarme do guia ("AlertaUrgencia"): fundo `alert-soft`,
          o triângulo e o título no vermelho. Sem linha de apoio — o aviso tem
          de ser lido de relance. */}
      <NavigationRow
        to={getKnowledgeQuestionPath(ALERT_QUESTION.categoryId, ALERT_QUESTION.questionId)}
        density="compact"
        tone="alert"
        leading={<TriangleAlert size={28} strokeWidth={2} className="shrink-0 text-destructive" aria-hidden="true" />}
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
        <>
          {/* A abertura do manual (07/10), antes dos temas. Conteúdo do próprio
              app: se a leitura falhar, o cartão só não aparece. */}
          {intro.data && <KnowledgeIntroCard intro={intro.data} />}

          <section aria-labelledby="knowledge-topics-title" aria-busy={isPending} className="flex flex-col gap-3">
            <SectionHeading id="knowledge-topics-title" variant="plain">
              Temas
            </SectionHeading>
            {topics}
          </section>
        </>
      )}

      <p className="px-1 text-caption font-medium text-muted-foreground">
        Conteúdo do Manual do Paciente Quimioterápico e do folheto do cateter da Supera Oncologia.
      </p>

      {/* "Fim da Central de Conhecimento", na sugestão de design do guia: o
          jardim cresce no canto, preso ao pé da tela, atrás do conteúdo; o vão
          no fim da página deixa os temas pararem acima dele. Fora da busca: lá
          o resultado vazio já traz a touceira. */}
      {!isSearching && (
        <>
          <div aria-hidden="true" className="h-[min(20dvh,180px)] shrink-0" />
          <GardenPainting kind="corner" className="fixed inset-x-0 bottom-0 -z-10 h-[min(28dvh,260px)]" />
        </>
      )}
    </KnowledgeScreen>
  );
}
