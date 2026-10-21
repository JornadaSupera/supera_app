import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ClipboardList, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import StepHeader from '../../components/ui/step-header';
import Loading from '../../components/ui/loading';
import ErrorState from '../../components/ui/error-state';
import EmptyState from '../../components/ui/empty-state';
import { CARE_PHRASES } from '../../components/ui/affective-phrase';
import Button from '../../components/ui/button';
import Textarea from '../../components/ui/textarea';
import AssistantExchangeCard from './AssistantExchangeCard';
import ContentRequestSheet from './ContentRequestSheet';
import {
  useAskContentAssistant,
  useAssistantExchanges,
  useContentAssistantSettings,
  useRequestContent,
} from '../../hooks/useContentAssistant';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import { useAssistantRequestStore } from '../../stores/assistantRequestStore';
import {
  QUESTION_HARD_MAX_CHARS,
  buildAssistantQuestionSchema,
  type AssistantQuestionFormValues,
} from '../../schemas/contentAssistant';
import type { AssistantExchange } from '../../types';

const EMPTY_FORM: AssistantQuestionFormValues = { question: '' };

/**
 * O assistente de orientações (o bônus de IA do contrato): a pessoa pergunta,
 * a IA resume o que as orientações da equipe dizem e mostra quais ler. Sem
 * orientação sobre o assunto, oferece o pedido de uma.
 *
 * Não é triagem nem canal de urgência (guia §5.5): a IA não avalia sintoma, e
 * a tela manda para o chat quem precisa da equipe.
 */
export default function ContentAssistant() {
  const navigate = useNavigate();
  const goBack = useGoBackOr('/orientacoes');
  const questionId = useId();
  const hintId = useId();
  const counterId = useId();
  const errorId = useId();

  const { data: settings, isLoading, isError, refetch } = useContentAssistantSettings();
  const ask = useAskContentAssistant();
  const exchanges = useAssistantExchanges();
  const requestMutation = useRequestContent();
  const requestedExchangeIds = useAssistantRequestStore((state) => state.requestedExchangeIds);
  const markRequested = useAssistantRequestStore((state) => state.markRequested);
  const [requestTarget, setRequestTarget] = useState<AssistantExchange | null>(null);

  // O teto é da clínica (`ai_assistant_question_max_chars`), sem passar do da função.
  const maxChars = Math.min(settings?.questionMaxChars ?? QUESTION_HARD_MAX_CHARS, QUESTION_HARD_MAX_CHARS);
  const schema = useMemo(() => buildAssistantQuestionSchema(maxChars), [maxChars]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<AssistantQuestionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_FORM,
  });

  const question = watch('question') ?? '';

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
      <div className="flex min-h-[100dvh] flex-col bg-background">
        {header}
        <ErrorState onRetry={() => void refetch()} />
      </div>
    );
  }

  // As entradas (Início e biblioteca) somem com a chave desligada (guia §5.5);
  // esta tela só aparece a quem chega por endereço direto ou quando a clínica
  // desliga com ela aberta.
  if (!settings.enabled) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        {header}
        <EmptyState
          illustration
          phrase={CARE_PHRASES.notAlone}
          title="O assistente não está disponível"
          description="Enquanto isso, procure na biblioteca de orientações ou fale com a equipe pelo chat."
          actionLabel="Ver orientações"
          onAction={() => navigate('/orientacoes')}
        />
      </div>
    );
  }

  function submit(values: AssistantQuestionFormValues) {
    if (ask.isPending) return;
    ask.mutate(values.question);
    reset(EMPTY_FORM);
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

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {header}

      {/* Margem de 16 px, a das telas no guia; blocos a 24 px (o reset global do
          `index.css` zera a margem dos `p`, daí o `gap`). */}
      <main className="flex flex-1 flex-col gap-6 px-4 pt-6 pb-[calc(2rem_+_var(--safe-bottom))]">
        {exchanges.length === 0 && (
          <section className="flex flex-col gap-2 rounded-lg bg-secondary p-4">
            <h2 className="flex items-center gap-2 text-card-title font-bold text-primary-deep">
              <Sparkles size={24} strokeWidth={2} className="shrink-0" aria-hidden="true" />
              Assistente com inteligência artificial
            </h2>
            <p className="text-body-sm text-foreground">
              Escreva o que você quer saber. A IA procura nas orientações da sua equipe, resume e mostra onde ler.
              Se ainda não houver nada sobre o assunto, você pode pedir uma orientação.
            </p>
          </section>
        )}

        <form className="flex flex-col gap-1" onSubmit={handleSubmit(submit)} noValidate>
          <label htmlFor={questionId} className="text-label font-semibold text-foreground">
            O que você quer saber?
          </label>
          <Textarea
            id={questionId}
            className={cn('mt-1 min-h-[96px]', errors.question && 'border-destructive')}
            maxLength={maxChars}
            placeholder="Ex.: o que posso comer durante a quimioterapia?"
            aria-describedby={errors.question ? `${hintId} ${counterId} ${errorId}` : `${hintId} ${counterId}`}
            aria-invalid={errors.question ? true : undefined}
            {...register('question')}
          />
          <div className="flex items-start justify-between gap-3">
            <p id={hintId} className="text-caption font-medium text-muted-foreground">
              Não escreva nome, CPF ou telefone. Para sintomas ou urgência, fale com a equipe pelo chat.
            </p>
            <span id={counterId} className="shrink-0 text-caption font-medium text-muted-foreground">
              {question.length}/{maxChars}
            </span>
          </div>
          {errors.question && (
            <span id={errorId} role="alert" className="text-caption font-medium text-destructive">
              {errors.question.message}
            </span>
          )}
          <Button type="submit" className="mt-2 self-end" loading={ask.isPending} disabled={ask.isPending}>
            Perguntar
          </Button>
        </form>

        {exchanges.length > 0 && (
          <section aria-label="Suas perguntas" aria-live="polite" className="flex flex-col gap-6">
            {exchanges.map((exchange) => (
              <AssistantExchangeCard
                key={exchange.id}
                exchange={exchange}
                hourlyLimit={settings.hourlyLimit}
                requested={requestedExchangeIds.includes(exchange.id)}
                onRetry={() => ask.mutate(exchange.question)}
                onRequest={() => setRequestTarget(exchange)}
              />
            ))}
          </section>
        )}
      </main>

      <ContentRequestSheet
        open={requestTarget !== null}
        defaultContext={requestDraft}
        loading={requestMutation.isPending}
        onSubmit={sendRequest}
        onClose={() => setRequestTarget(null)}
      />
    </div>
  );
}
