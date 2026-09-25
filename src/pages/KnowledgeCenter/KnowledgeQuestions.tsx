import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { BookOpenText, MessageCircle, Search, SearchX } from 'lucide-react';
import FlowScreen from '../../components/ui/flow-screen';
import ExpansionTile from '../../components/ui/expansion-tile';
import Input from '../../components/ui/input';
import Skeleton from '../../components/ui/skeleton';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import KnowledgeAnswer from './KnowledgeAnswer';
import { useKnowledgeCategory } from '../../hooks/useKnowledgeCenter';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import {
  KNOWLEDGE_CENTER_PATH,
  filterKnowledgeQuestions,
  formatSearchResultCount,
  normalizeSearchText,
} from '../../utils/knowledgeCenter';
import type { KnowledgeQuestion } from '../../types';

/**
 * A busca aparece a partir desta quantidade de perguntas. Num tema com uma ou
 * duas, o campo só ocuparia espaço: as perguntas já estão todas à vista.
 */
const SEARCH_MIN_QUESTIONS = 3;

/** Carregamento com a forma da lista: o campo de busca e as perguntas fechadas. */
function QuestionListSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando as perguntas">
      <Skeleton className="h-11 w-full rounded-xl" />
      <div className="flex flex-col gap-2.5">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * As perguntas do tema, em accordion: só uma resposta aberta por vez, para a
 * tela nunca virar um bloco de texto.
 */
function QuestionList({ questions }: { questions: KnowledgeQuestion[] }) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // O campo responde a cada tecla; a lista filtra logo depois, sem travar a digitação.
  const deferredQuery = useDeferredValue(query);
  const isSearching = normalizeSearchText(deferredQuery) !== '';
  const visibleQuestions = useMemo(
    () => filterKnowledgeQuestions(questions, deferredQuery),
    [questions, deferredQuery]
  );

  // O botão "Limpar busca" some junto com o estado vazio: o foco volta ao
  // campo, em vez de cair no começo da página.
  function clearSearch() {
    setQuery('');
    searchRef.current?.focus();
  }

  if (questions.length === 0) {
    return (
      <EmptyState
        className="min-h-0 py-10"
        icon={BookOpenText}
        title="Nenhuma pergunta neste tema"
        description="As perguntas aparecem aqui assim que a clínica as publicar."
      />
    );
  }

  return (
    <>
      {questions.length >= SEARCH_MIN_QUESTIONS && (
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          // A lista já filtra enquanto se digita: a tecla "Buscar" do teclado
          // só fecha o teclado, para deixar os resultados à vista.
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          placeholder="Buscar pergunta"
          aria-label="Buscar pergunta neste tema"
          enterKeyHint="search"
          iconLeft={Search}
        />
      )}

      {/* Quem usa leitor de tela ouve quantas perguntas sobraram a cada busca. */}
      <p className="sr-only" aria-live="polite">
        {isSearching ? formatSearchResultCount(visibleQuestions.length) : ''}
      </p>

      {visibleQuestions.length === 0 ? (
        <EmptyState
          className="min-h-0 py-10"
          icon={SearchX}
          title="Nenhuma pergunta encontrada"
          description="Tente outra palavra, ou veja todas as perguntas do tema."
          actionLabel="Limpar busca"
          onAction={clearSearch}
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {visibleQuestions.map((item) => (
            <ExpansionTile
              key={item.id}
              variant="contained"
              title={item.question}
              open={openId === item.id}
              onOpenChange={(open) => setOpenId(open ? item.id : null)}
              revealOnOpen
              // Distância do topo ao trazer a pergunta de volta à tela: a
              // altura da barra fixa, que não pode cobri-la.
              className="scroll-mt-[calc(4.5rem+var(--safe-top))]"
            >
              <KnowledgeAnswer blocks={item.answer} />
            </ExpansionTile>
          ))}
        </div>
      )}

      <div className="flex flex-col items-start pt-2">
        <p className="text-[13px]/[1.5] text-muted-foreground">Ficou com alguma dúvida?</p>
        {/* Linha própria com 44 px de toque. Cor e sublinhado vão no `span`: o
            reset global de `a` (fora de camada) anula `color` e
            `text-decoration` postos no próprio link. O verde da marca
            (`--color-primary`) daria 2,85:1 sobre o fundo claro, abaixo dos
            4,5:1 de texto pequeno; o verde escuro passa nos dois temas. */}
        <Link to="/chat" className="inline-flex min-h-[44px] items-center gap-2 text-[14px] font-semibold">
          <MessageCircle
            size={16}
            strokeWidth={2}
            className="shrink-0 text-[var(--color-supera-seguranca)]"
            aria-hidden="true"
          />
          <span className="text-[var(--color-supera-seguranca)] underline underline-offset-2">
            Fale com a sua equipe pelo chat
          </span>
        </Link>
      </div>
    </>
  );
}

/** Um tema da Central de Conhecimento: busca e as perguntas, que abrem uma por vez. */
export default function KnowledgeQuestions() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBackOr(KNOWLEDGE_CENTER_PATH);
  const { data: category, isPending, isError, refetch } = useKnowledgeCategory(categoryId);

  if (isError) {
    return (
      <FlowScreen title="Central de Conhecimento" onBack={goBack}>
        <ErrorState
          className="min-h-0 py-10"
          title="Não foi possível abrir as perguntas"
          onRetry={() => void refetch()}
        />
      </FlowScreen>
    );
  }

  // Sem `categoryId` a consulta nem roda (fica pendente para sempre): é o
  // mesmo caso de um tema que não existe.
  if (categoryId && isPending) {
    return (
      <FlowScreen title="" onBack={goBack}>
        <QuestionListSkeleton />
      </FlowScreen>
    );
  }

  if (!category) {
    return (
      <FlowScreen title="Central de Conhecimento" onBack={goBack}>
        <EmptyState
          className="min-h-0 py-10"
          icon={SearchX}
          title="Tema não encontrado"
          description="Este tema não está mais na Central de Conhecimento."
          actionLabel="Ver todos os temas"
          onAction={() => navigate(KNOWLEDGE_CENTER_PATH, { replace: true })}
        />
      </FlowScreen>
    );
  }

  return (
    <FlowScreen title={category.label} onBack={goBack}>
      {/* `key`: trocar de tema começa do zero (busca vazia, tudo fechado). */}
      <QuestionList key={category.id} questions={category.questions} />
    </FlowScreen>
  );
}
