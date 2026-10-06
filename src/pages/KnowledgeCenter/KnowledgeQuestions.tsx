import { useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { BookOpenText, Search, SearchX } from 'lucide-react';
import ExpansionTile from '../../components/ui/expansion-tile';
import Input from '../../components/ui/input';
import Skeleton from '../../components/ui/skeleton';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import ClinicContacts from '../../components/ClinicContacts';
import GardenPainting from '../../components/ui/garden-painting';
import KnowledgeSearchEmpty from './KnowledgeSearchEmpty';
import KnowledgeAnswer from './KnowledgeAnswer';
import KnowledgeScreen from './KnowledgeScreen';
import KnowledgeCategoryIcon from './KnowledgeCategoryIcon';
import { useKnowledgeCategory } from '../../hooks/useKnowledgeCenter';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import {
  KNOWLEDGE_CENTER_PATH,
  OPEN_QUESTION_PARAM,
  filterKnowledgeQuestions,
  formatQuestionCount,
  formatSearchResultCount,
  getKnowledgeCategoryAppearance,
  getKnowledgeQuestionAnchor,
  normalizeSearchText,
} from '../../utils/knowledgeCenter';
import type { KnowledgeCategoryDetail, KnowledgeQuestion } from '../../types';

/**
 * A busca aparece a partir desta quantidade de perguntas. Num tema com uma ou
 * duas, o campo só ocuparia espaço: as perguntas já estão todas à vista.
 */
const SEARCH_MIN_QUESTIONS = 3;

/**
 * Título do tema na capa, enquanto carrega: blocos claros sobre o verde, na
 * forma da `CategoryCover` e com a altura das linhas dela (o título de 30 px,
 * a linha de apoio de 21 e a contagem de 26). A capa não cresce quando o tema
 * chega.
 */
function CoverSkeleton() {
  return (
    <div className="flex flex-col gap-4 pt-4" aria-hidden="true">
      <Skeleton className="size-14 rounded-lg bg-[color-mix(in_srgb,var(--color-on-brand-cover)_18%,transparent)]" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-[30px] w-3/5 rounded-lg bg-[color-mix(in_srgb,var(--color-on-brand-cover)_18%,transparent)]" />
        <Skeleton className="h-[21px] w-4/5 rounded-md bg-[color-mix(in_srgb,var(--color-on-brand-cover)_14%,transparent)]" />
        <Skeleton className="h-[26px] w-24 rounded-full bg-[color-mix(in_srgb,var(--color-on-brand-cover)_14%,transparent)]" />
      </div>
    </div>
  );
}

/**
 * Carregamento com a forma da lista: a busca e as perguntas fechadas, com os
 * vãos da tela (24 px até a lista, 8 px entre as perguntas). A pergunta
 * fechada tem 70 px: o cabeçalho de 68 e o fio de cima e de baixo.
 */
function QuestionListSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando as perguntas">
      <Skeleton className="h-[52px] w-full rounded-full" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-[70px] w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * O título do tema na capa verde: a pastilha com o ícone, o nome (título de
 * capa do guia, `text-hero`, 24/30 em negrito), a linha sobre o que ele
 * responde e quantas perguntas tem. Entre o nome, a linha e a contagem, os
 * 12 px da capa inicial da Central e da "Sobre a Supera".
 */
function CategoryCover({ category }: { category: KnowledgeCategoryDetail }) {
  const { description } = getKnowledgeCategoryAppearance(category.id);

  return (
    <div className="flex flex-col gap-4 pt-4">
      <KnowledgeCategoryIcon categoryId={category.id} tone="cover" size="lg" />
      <div className="flex flex-col gap-3">
        <h1 className="text-hero font-bold text-balance">{category.label}</h1>
        <p className="text-body-sm">{description}</p>
        <span className="w-fit rounded-full bg-[var(--color-brand-cover-deep)] px-3 py-1 text-caption font-semibold ring-1 ring-[color-mix(in_srgb,var(--color-on-brand-cover)_22%,transparent)] ring-inset">
          {formatQuestionCount(category.questions.length)}
        </span>
      </div>
    </div>
  );
}

interface QuestionListProps {
  questions: KnowledgeQuestion[];
  /** Pergunta que já abre aberta e à vista (link da busca ou do atalho de alerta). */
  initialOpenId: string | null;
}

/**
 * As perguntas do tema, em accordion: só uma resposta aberta por vez, para a
 * tela nunca virar um bloco de texto.
 */
function QuestionList({ questions, initialOpenId }: QuestionListProps) {
  // Pergunta que não existe no tema (link antigo) é ignorada: o tema abre fechado.
  const [linkedId] = useState(() =>
    initialOpenId && questions.some((item) => item.id === initialOpenId) ? initialOpenId : null
  );
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(linkedId);
  const searchRef = useRef<HTMLInputElement>(null);
  // O campo responde a cada tecla; a lista filtra logo depois, sem travar a digitação.
  const deferredQuery = useDeferredValue(query);
  const isSearching = normalizeSearchText(deferredQuery) !== '';
  const visibleQuestions = useMemo(
    () => filterKnowledgeQuestions(questions, deferredQuery),
    [questions, deferredQuery]
  );

  // Aberta por um link: rola até ela uma vez, ao montar. O `scroll-margin`
  // do bloco deixa a pergunta logo abaixo do voltar fixo. `useLayoutEffect`,
  // antes da primeira pintura: a tela já aparece na pergunta, sem mostrar o
  // topo e pular. (Com `requestAnimationFrame` a rolagem não acontecia com o
  // app em segundo plano, que para os quadros.)
  useLayoutEffect(() => {
    if (!linkedId) return;
    document.getElementById(getKnowledgeQuestionAnchor(linkedId))?.scrollIntoView({ block: 'start' });
  }, [linkedId]);

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
          surface="pill"
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
        <KnowledgeSearchEmpty showAllLabel="Ver todas as perguntas" onShowAll={clearSearch} />
      ) : (
        // 8 px entre as perguntas, como entre as linhas de um mesmo grupo no
        // guia (e entre os contatos logo abaixo).
        <div className="flex flex-col gap-2">
          {visibleQuestions.map((item) => (
            <ExpansionTile
              key={item.id}
              id={getKnowledgeQuestionAnchor(item.id)}
              variant="raised"
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

      {/* Seção agrupada do guia: o fundo `surface-alt`, com os cantos de 20 px.
          O `mt-2` soma-se aos 24 px da moldura: 32 px até as perguntas, a
          separação entre seções do guia. */}
      <section
        aria-labelledby="knowledge-contacts-title"
        className="mt-2 flex flex-col gap-3 rounded-2xl bg-muted p-4"
      >
        <div className="flex flex-col gap-1 px-1">
          {/* O título de card do guia: `text-card-title`, 17/22 em negrito. */}
          <h2 id="knowledge-contacts-title" className="text-card-title font-bold text-foreground">
            Ficou com alguma dúvida?
          </h2>
          <p className="text-body-sm text-muted-foreground">Fale com a equipe da Supera.</p>
        </div>
        <ClinicContacts surface="raised" />
      </section>

      {/* "Fim da página de um tema", na sugestão de design do guia: o campo
          florido fecha a página, depois da última informação, encostado na
          borda de baixo — os recuos negativos desfazem as margens da moldura
          (`KnowledgeScreen`). Na busca sem resultado a touceira já está lá, e
          o guia pede uma pintura por tela. */}
      {visibleQuestions.length > 0 && (
        <GardenPainting
          kind="band"
          className="-mx-4 mt-auto -mb-[calc(2.5rem_+_var(--safe-bottom))] h-[min(42vw,220px)]"
        />
      )}
    </>
  );
}

/** Um tema da Central de Conhecimento: busca e as perguntas, que abrem uma por vez. */
export default function KnowledgeQuestions() {
  const { categoryId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const goBack = useGoBackOr(KNOWLEDGE_CENTER_PATH);
  const { data: category, isPending, isError, refetch } = useKnowledgeCategory(categoryId);

  if (isError) {
    return (
      <KnowledgeScreen onBack={goBack} cover={<h1 className="pt-4 text-hero font-bold">Central de Conhecimento</h1>}>
        <ErrorState
          className="min-h-0 py-10"
          title="Não foi possível abrir as perguntas"
          onRetry={() => void refetch()}
        />
      </KnowledgeScreen>
    );
  }

  // Sem `categoryId` a consulta nem roda (fica pendente para sempre): é o
  // mesmo caso de um tema que não existe.
  if (categoryId && isPending) {
    return (
      <KnowledgeScreen
        onBack={goBack}
        cover={
          <>
            <h1 className="sr-only">Central de Conhecimento</h1>
            <CoverSkeleton />
          </>
        }
      >
        <QuestionListSkeleton />
      </KnowledgeScreen>
    );
  }

  if (!category) {
    return (
      <KnowledgeScreen onBack={goBack} cover={<h1 className="pt-4 text-hero font-bold">Central de Conhecimento</h1>}>
        <EmptyState
          className="min-h-0 py-10"
          icon={SearchX}
          title="Tema não encontrado"
          description="Este tema não está mais na Central de Conhecimento."
          actionLabel="Ver todos os temas"
          onAction={() => navigate(KNOWLEDGE_CENTER_PATH, { replace: true })}
        />
      </KnowledgeScreen>
    );
  }

  return (
    <KnowledgeScreen onBack={goBack} cover={<CategoryCover category={category} />}>
      {/* `key`: trocar de tema começa do zero (busca vazia, tudo fechado). */}
      <QuestionList
        key={category.id}
        questions={category.questions}
        initialOpenId={searchParams.get(OPEN_QUESTION_PARAM)}
      />
    </KnowledgeScreen>
  );
}
