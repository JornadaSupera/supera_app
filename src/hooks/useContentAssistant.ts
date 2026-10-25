import { useCallback } from 'react';
import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  askContentAssistant,
  cancelContentRequest,
  getContentAssistantSettings,
  getContentRequests,
  requestContent,
} from '../services/contentAssistant';
import { AppError } from '../lib/appError';
import { useToast } from '../contexts/ToastContext';
import { describeMutationError } from './useAuth';
import type { AssistantExchange, AssistantQuestionInput, AssistantReply } from '../types';

// Assistente de orientações com IA e pedido de orientação (guia do banco §5.5).

export const contentAssistantKeys = {
  all: ['content-assistant'] as const,
  settings: () => [...contentAssistantKeys.all, 'settings'] as const,
  ask: () => [...contentAssistantKeys.all, 'ask'] as const,
  requests: () => [...contentAssistantKeys.all, 'requests'] as const,
};

/**
 * A conversa fica na memória enquanto a conta estiver aberta no app: é o
 * "Histórico" da tela (guia §5.5 — o histórico da sessão). Sai no logout e na
 * troca de conta (`queryClient.clear()`) e ao fechar o app; nunca vai ao
 * armazenamento do aparelho.
 */
const EXCHANGE_GC_MS = Infinity;

function isQuestionInput(value: unknown): value is AssistantQuestionInput {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.question === 'string';
}

/**
 * A chave do assistente e os limites da clínica. Mudam pelo painel, raramente;
 * cinco minutos bastam para o desligar chegar sem uma leitura a cada tela.
 */
export function useContentAssistantSettings() {
  return useQuery({
    queryKey: contentAssistantKeys.settings(),
    queryFn: ({ signal }) => getContentAssistantSettings(signal),
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Pergunta ao assistente. A resposta fica no cache de mutations (memória)
 * enquanto a conta estiver aberta, e `useAssistantExchanges` a devolve à tela.
 * O `id` da entrada é do app: só a pergunta vai à função.
 *
 * `assistant_disabled`: a clínica desligou enquanto a tela estava aberta —
 * relê a chave, e a tela some.
 */
export function useAskContentAssistant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: contentAssistantKeys.ask(),
    mutationFn: ({ question }: AssistantQuestionInput) => askContentAssistant(question),
    gcTime: EXCHANGE_GC_MS,
    onError: (error) => {
      if (error instanceof AppError && error.code === 'assistant_disabled') {
        void queryClient.invalidateQueries({ queryKey: contentAssistantKeys.settings() });
      }
    },
  });
}

/** As perguntas da sessão, da mais recente para a mais antiga. */
export function useAssistantExchanges(): AssistantExchange[] {
  const exchanges = useMutationState({
    filters: { mutationKey: contentAssistantKeys.ask() },
    select: (mutation): AssistantExchange | null => {
      const { variables } = mutation.state;
      if (!isQuestionInput(variables)) return null;

      return {
        id: variables.id,
        question: variables.question,
        askedAt: mutation.state.submittedAt,
        isPending: mutation.state.status === 'pending',
        // O `mutationKey` só é usado por `useAskContentAssistant`.
        reply: (mutation.state.data as AssistantReply | undefined) ?? null,
        error: mutation.state.error,
      };
    },
  });

  return exchanges.filter((exchange): exchange is AssistantExchange => exchange !== null).reverse();
}

/**
 * Tira uma pergunta da conversa. Serve à nova tentativa de uma pergunta que
 * falhou: a tentativa toma o lugar dela, em vez de o histórico guardar as duas.
 */
export function useDiscardAssistantExchange() {
  const queryClient = useQueryClient();

  return useCallback(
    (exchangeId: string) => {
      const cache = queryClient.getMutationCache();
      const mutation = cache
        .findAll({ mutationKey: contentAssistantKeys.ask() })
        .find((candidate) => isQuestionInput(candidate.state.variables) && candidate.state.variables.id === exchangeId);
      if (mutation) cache.remove(mutation);
    },
    [queryClient]
  );
}

/**
 * Os pedidos de orientação que a sessão enxerga. `enabled: false` deixa a
 * leitura para quando ela servir (a biblioteca só precisa dela com o
 * assistente desligado).
 */
export function useContentRequests({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: contentAssistantKeys.requests(),
    queryFn: ({ signal }) => getContentRequests(signal),
    enabled,
  });
}

export function useRequestContent() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: requestContent,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contentAssistantKeys.requests() });
      showToast('Pedido enviado. Você recebe um aviso quando a equipe responder.', { variant: 'success' });
    },
    onError: (error) => {
      showToast(describeMutationError(error, 'Não foi possível enviar o pedido.'), { variant: 'error' });
    },
  });
}

export function useCancelContentRequest() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: cancelContentRequest,
    onSuccess: () => {
      showToast('Pedido retirado.', { variant: 'success' });
    },
    onError: (error) => {
      showToast(describeMutationError(error, 'Não foi possível retirar o pedido.'), { variant: 'error' });
    },
    // Também no erro: `content_request_not_open` quer dizer que a equipe
    // respondeu antes, e a lista precisa mostrar isso.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: contentAssistantKeys.requests() });
    },
  });
}
