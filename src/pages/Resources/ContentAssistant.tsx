import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft, ClipboardList, History, MessageCircleQuestionMark, PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import StepHeader from '../../components/ui/step-header';
import Loading from '../../components/ui/loading';
import ErrorState from '../../components/ui/error-state';
import EmptyState from '../../components/ui/empty-state';
import GardenPainting from '../../components/ui/garden-painting';
import SegmentedControl, { type SegmentedOption } from '../../components/ui/segmented-control';
import { CARE_PHRASES } from '../../components/ui/affective-phrase';
import Button from '../../components/ui/button';
import AssistantComposer from './AssistantComposer';
import AssistantExchangeCard from './AssistantExchangeCard';
import AssistantHistoryList from './AssistantHistoryList';
import ContentRequestSheet from './ContentRequestSheet';
import { assistantSearchParams, isHistoryLinkState, readAssistantView, type AssistantView } from './assistantSearch';
import {
  useAskContentAssistant,
  useAssistantExchanges,
  useContentAssistantSettings,
  useDiscardAssistantExchange,
  useRequestContent,
} from '../../hooks/useContentAssistant';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import { useAssistantRequestStore } from '../../stores/assistantRequestStore';
import {
  QUESTION_HARD_MAX_CHARS,
  buildAssistantQuestionSchema,
  type AssistantQuestionFormValues,
} from '../../schemas/contentAssistant';
import type { AssistantExchange, AssistantTab } from '../../types';

const EMPTY_FORM: AssistantQuestionFormValues = { question: '' };

const TABS: readonly SegmentedOption<AssistantTab>[] = [
  { key: 'ask', label: 'Perguntar', icon: MessageCircleQuestionMark },
  { key: 'history', label: 'Histórico', icon: History },
];

/** De quanto em quanto tempo o "Há 5min" do histórico se atualiza com a tela aberta. */
const CLOCK_TICK_MS = 60_000;

/** A pergunta que acabou de sair, antes de o cache de mutations a devolver à tela. */
interface JustAsked extends Pick<AssistantExchange, 'id' | 'question' | 'askedAt'> {
  /** A pergunta que falhou e que esta nova tentativa substitui. */
  replaces?: string;
}

/**
 * Moldura da tela: o fundo liso do app, e o único enfeite é o canteiro de
 * flores no pé (pedido de 25/10 — o fundo de bambu do Chat saiu daqui).
 */
function AssistantScreen({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[100dvh] flex-col bg-background">{children}</div>;
}

/**
 * Uma pergunta aberta inteira — a resposta em "Perguntar" logo depois de
 * enviar, ou o detalhe de uma pergunta do "Histórico". Abre do começo e recebe
 * o foco, para o leitor de tela começar por ela; a resposta que chega é
 * anunciada.
 *
 * A troca é só no endereço (`?pergunta=`), então nada leva a página ao topo
 * sozinho: abrir uma pergunta do fim da lista a mostraria pelo meio. Na volta
 * de uma orientação citada (POP), fica a rolagem restaurada.
 */
function OpenExchange({ exchangeId, children }: { exchangeId: string; children: ReactNode }) {
  const sectionRef = useRef<HTMLElement>(null);
  const navigationType = useNavigationType();

  // Antes de pintar: a pergunta aparece já do começo.
  useLayoutEffect(() => {
    if (navigationType !== 'POP') window.scrollTo({ top: 0 });
    sectionRef.current?.focus({ preventScroll: true });
  }, [exchangeId, navigationType]);

  return (
    // `outline-none!`: o anel de foco global (`:focus-visible`, fora de camada
    // no `index.css`) contornaria a pergunta inteira depois de um Enter.
    <section ref={sectionRef} tabIndex={-1} aria-live="polite" aria-label="Sua pergunta" className="flex flex-col gap-4 outline-none!">
      {children}
    </section>
  );
}

/**
 * O assistente de orientações (o bônus de IA do contrato): a pessoa pergunta,
 * a IA resume o que as orientações da equipe dizem e mostra quais ler. Sem
 * orientação sobre o assunto, oferece o pedido de uma.
 *
 * Duas abas (pedido de 24/10): "Perguntar", só com o campo — e, depois de
 * enviar, só a resposta daquela pergunta —, e "Histórico", com as perguntas da
 * sessão. Elas vivem na memória enquanto a conta estiver aberta no app (guia
 * §5.5: nada da pergunta vai ao banco). A aba e a pergunta aberta ficam no
 * endereço, para a volta de uma orientação citada reencontrar a tela como
 * estava.
 *
 * Não é triagem nem canal de urgência (guia §5.5): a IA não avalia sintoma, e
 * a tela manda para o chat quem precisa da equipe.
 */
export default function ContentAssistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useGoBackOr('/orientacoes');
  const [searchParams, setSearchParams] = useSearchParams();
  const view = readAssistantView(searchParams);

  const { data: settings, isLoading, isError, refetch } = useContentAssistantSettings();
  const ask = useAskContentAssistant();
  const exchanges = useAssistantExchanges();
  const discardExchange = useDiscardAssistantExchange();
  const requestMutation = useRequestContent();
  const requestedExchangeIds = useAssistantRequestStore((state) => state.requestedExchangeIds);
  const markRequested = useAssistantRequestStore((state) => state.markRequested);
  const [requestTarget, setRequestTarget] = useState<AssistantExchange | null>(null);
  const [justAsked, setJustAsked] = useState<JustAsked | null>(null);
  const [focusComposer, setFocusComposer] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // A pergunta de onde se voltou ao histórico: a linha dela recebe o foco.
  const [returnFocusId, setReturnFocusId] = useState<string | null>(null);
  // A aba pedida a partir de um detalhe aberto pela lista: primeiro a tela
  // volta à lista (desempilha o detalhe) e só então troca de aba.
  const pendingTabRef = useRef<AssistantTab | null>(null);

  // O teto é da clínica (`ai_assistant_question_max_chars`), sem passar do da função.
  const maxChars = Math.min(settings?.questionMaxChars ?? QUESTION_HARD_MAX_CHARS, QUESTION_HARD_MAX_CHARS);
  const schema = useMemo(() => buildAssistantQuestionSchema(maxChars), [maxChars]);

  // O formulário mora aqui, e não no campo: trocar de aba não perde o rascunho.
  const form = useForm<AssistantQuestionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_FORM,
  });

  // O relógio do "Há 5min": acerta ao abrir o histórico e anda com ele aberto.
  useEffect(() => {
    if (view.tab !== 'history') return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, [view.tab]);

  useEffect(() => {
    const tab = pendingTabRef.current;
    if (!tab || isHistoryLinkState(location.state)) return;
    pendingTabRef.current = null;
    setSearchParams(assistantSearchParams({ tab, exchangeId: null }), { replace: true });
    window.scrollTo({ top: 0 });
  }, [location.key, location.state, setSearchParams]);

  // Uma pergunta por vez — inclusive a que ficou correndo de uma visita
  // anterior à tela (o `isPending` da mutation é só desta montagem).
  const asking = ask.isPending || exchanges.some((exchange) => exchange.isPending);

  const openExchange: AssistantExchange | null = (() => {
    if (!view.exchangeId) return null;
    // Uma nova tentativa tira a pergunta que falhou antes de o endereço
    // trocar de id: nesse instante, a aberta já é a nova.
    const id = justAsked?.replaces === view.exchangeId ? justAsked.id : view.exchangeId;
    const found = exchanges.find((exchange) => exchange.id === id);
    if (found) return found;
    // A pergunta acabou de sair e o cache ainda não a devolveu (ele avisa a
    // tela no instante seguinte): mostra a espera em vez de piscar o campo.
    if (justAsked?.id === id) {
      return { id, question: justAsked.question, askedAt: justAsked.askedAt, isPending: true, reply: null, error: null };
    }
    // Id que não está mais na memória (o app foi fechado): a aba como se
    // nada estivesse aberto.
    return null;
  })();

  const header = (
    <StepHeader
      onBack={goBack}
      title="Pergunte à IA"
      actions={
        <Button
          variant="soft"
          size="compact"
          pill
          iconLeft={ClipboardList}
          onClick={() => navigate('/orientacoes/pedidos')}
        >
          Meus pedidos
        </Button>
      }
    />
  );

  if (isLoading) return <Loading />;

  if (isError || !settings) {
    return (
      <AssistantScreen>
        {header}
        <ErrorState onRetry={() => void refetch()} />
      </AssistantScreen>
    );
  }

  // As entradas (Início e biblioteca) somem com a chave desligada (guia §5.5);
  // esta tela só aparece a quem chega por endereço direto ou quando a clínica
  // desliga com ela aberta.
  if (!settings.enabled) {
    return (
      <AssistantScreen>
        {header}
        <EmptyState
          illustration
          phrase={CARE_PHRASES.notAlone}
          title="O assistente não está disponível"
          description="Enquanto isso, procure na biblioteca de orientações ou fale com a equipe pelo chat."
          actionLabel="Ver orientações"
          onAction={() => navigate('/orientacoes')}
        />
      </AssistantScreen>
    );
  }

  /**
   * Troca a visão no endereço. Sem `push`, substitui a entrada atual: trocar
   * de aba ou perguntar não enche o "voltar" do celular.
   */
  function showView(next: AssistantView, options: { push?: boolean; state?: unknown } = {}) {
    setSearchParams(assistantSearchParams(next), { replace: !options.push, state: options.state });
  }

  function selectTab(tab: AssistantTab) {
    // "Perguntar" com uma resposta aberta fica nela: a pergunta nova é pelo
    // "Fazer outra pergunta". "Histórico" com um detalhe aberto volta à lista.
    if (tab === view.tab && (tab === 'ask' || !view.exchangeId)) return;
    setFocusComposer(false);

    // Detalhe aberto pela lista: a lista é a entrada de trás. Desempilhar (e
    // não trocar) mantém o "voltar" do celular saindo da tela, como antes.
    if (view.exchangeId && isHistoryLinkState(location.state)) {
      if (tab === 'history') {
        backToHistory();
        return;
      }
      pendingTabRef.current = tab;
      navigate(-1);
      return;
    }

    setReturnFocusId(null);
    showView({ tab, exchangeId: null });
    window.scrollTo({ top: 0 });
  }

  function askQuestion(question: string, tab: AssistantTab, options: { state?: unknown; replaces?: string } = {}) {
    const id = crypto.randomUUID();
    setJustAsked({ id, question, askedAt: Date.now(), replaces: options.replaces });
    ask.mutate({ id, question });
    showView({ tab, exchangeId: id }, { state: options.state });
  }

  const submit = form.handleSubmit((values) => {
    if (asking) return;
    askQuestion(values.question, 'ask');
    form.reset(EMPTY_FORM);
    setFocusComposer(false);
  });

  /** A nova tentativa toma o lugar da pergunta que falhou, na mesma aba. */
  function retry(exchange: AssistantExchange) {
    if (asking) return;
    discardExchange(exchange.id);
    askQuestion(exchange.question, view.tab, { state: location.state, replaces: exchange.id });
  }

  function newQuestion() {
    setFocusComposer(true);
    showView({ tab: 'ask', exchangeId: null });
    window.scrollTo({ top: 0 });
  }

  function backToHistory() {
    setReturnFocusId(view.exchangeId);
    // Aberta pela lista: volta a ela (com a rolagem de antes). Aberta por
    // outro caminho (endereço direto): troca pela lista.
    if (isHistoryLinkState(location.state)) {
      navigate(-1);
      return;
    }
    showView({ tab: 'history', exchangeId: null });
  }

  function sendRequest(context: string) {
    if (!requestTarget) return;
    const target = requestTarget;
    requestMutation.mutate(
      { context, originalQuestion: target.question },
      {
        onSuccess: () => {
          markRequested(target.id);
          setRequestTarget(null);
        },
      }
    );
  }

  const requestDraft =
    requestTarget?.reply?.status === 'no_match' ? requestTarget.reply.suggestedContext : (requestTarget?.question ?? '');

  function renderExchangeCard(exchange: AssistantExchange) {
    return (
      <AssistantExchangeCard
        exchange={exchange}
        hourlyLimit={settings?.hourlyLimit ?? 0}
        requested={requestedExchangeIds.includes(exchange.id)}
        // Com outra pergunta em andamento, a nova tentativa espera: o botão só
        // volta quando ela terminar (um botão que não faz nada não fica à vista).
        onRetry={asking ? undefined : () => retry(exchange)}
        onRequest={() => setRequestTarget(exchange)}
      />
    );
  }

  function renderContent() {
    if (view.tab === 'ask') {
      if (openExchange) {
        return (
          <OpenExchange exchangeId={openExchange.id}>
            {renderExchangeCard(openExchange)}
            {!openExchange.isPending && (
              <Button variant="soft" pill iconLeft={PenLine} className="self-center" onClick={newQuestion}>
                Fazer outra pergunta
              </Button>
            )}
          </OpenExchange>
        );
      }

      return (
        <AssistantComposer form={form} maxChars={maxChars} busy={asking} onSubmit={submit} autoFocus={focusComposer} />
      );
    }

    if (openExchange) {
      return (
        <OpenExchange exchangeId={openExchange.id}>
          <Button variant="ghost" size="compact" pill iconLeft={ChevronLeft} className="-ml-2 self-start" onClick={backToHistory}>
            Todas as perguntas
          </Button>
          {renderExchangeCard(openExchange)}
        </OpenExchange>
      );
    }

    if (exchanges.length === 0) {
      return (
        <EmptyState
          className="min-h-0 py-6"
          illustration
          phrase={CARE_PHRASES.seeBeauty}
          title="Nenhuma pergunta ainda"
          description="As perguntas que você fizer ficam aqui enquanto você estiver no app."
          actionLabel="Fazer uma pergunta"
          onAction={newQuestion}
        />
      );
    }

    return (
      <div className="flex flex-col gap-3">
        {/* Na cor de leitura: é o aviso de que a lista não fica guardada. */}
        <p className="text-caption font-medium text-foreground">
          Ficam aqui enquanto você estiver no app. Ao sair da conta ou fechar o app, a lista recomeça.
        </p>
        <AssistantHistoryList
          exchanges={exchanges}
          requestedExchangeIds={requestedExchangeIds}
          now={now}
          focusExchangeId={returnFocusId}
        />
      </div>
    );
  }

  // O vazio do histórico já traz a touceira do guia: uma pintura por tela.
  const showGarden = !(view.tab === 'history' && !openExchange && exchanges.length === 0);

  return (
    <AssistantScreen>
      {header}

      {/* Margem de 16 px, a das telas no guia; blocos a 24 px (o reset global do
          `index.css` zera a margem dos `p`, daí o `gap`). Com o jardim, o pé da
          tela é dele: a margem da área segura sai do conteúdo. */}
      <main
        className={cn(
          'flex flex-1 flex-col gap-6 px-4 pt-4',
          showGarden ? 'pb-8' : 'pb-[calc(2rem_+_var(--safe-bottom))]'
        )}
      >
        <SegmentedControl options={TABS} value={view.tab} onChange={selectTab} aria-label="Perguntar ou ver o histórico" />
        {renderContent()}
      </main>

      {/* O canteiro do guia no fim da rolagem, discreto. Some quando o teclado
          encolhe a tela, para não disputar espaço com o campo. */}
      {showGarden && (
        <GardenPainting kind="band" className="h-[min(36vw,180px)] [@media(max-height:560px)]:hidden" />
      )}

      <ContentRequestSheet
        open={requestTarget !== null}
        defaultContext={requestDraft}
        loading={requestMutation.isPending}
        onSubmit={sendRequest}
        onClose={() => setRequestTarget(null)}
      />
    </AssistantScreen>
  );
}
