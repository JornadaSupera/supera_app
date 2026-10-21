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
import type { AssistantExchange, AssistantReply } from '../types';

// Assistente de orientações com IA e pedido de orientação (guia do banco §5.5).

export const contentAssistantKeys = {
  all: ['content-assistant'] as const,
  settings: () => [...contentAssistantKeys.all, 'settings'] as const,
  ask: () => [...contentAssistantKeys.all, 'ask'] as const,
  requests: () => [...contentAssistantKeys.all, 'requests'] as const,
};

/** Quanto a conversa da sessão fica na memória depois que a tela fecha. */
const EXCHANGE_GC_MS = 1000 * 60 * 30;

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
 * Pergunta ao assistente. A resposta fica no cache de mutations (memória) por
 * meia hora, e `useAssistantExchanges` a devolve à tela.
 *
 * `assistant_disabled`: a clínica desligou enquanto a tela estava aberta —
 * relê a chave, e a tela some.
 */
export function useAskContentAssistant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: contentAssistantKeys.ask(),
    mutationFn: askContentAssistant,
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
    select: (mutation): AssistantExchange => ({
      id: mutation.mutationId,
      question: typeof mutation.state.variables === 'string' ? mutation.state.variables : '',
      isPending: mutation.state.status === 'pending',
      // O `mutationKey` só é usado por `useAskContentAssistant`.
      reply: (mutation.state.data as AssistantReply | undefined) ?? null,
      error: mutation.state.error,
    }),
  });

  return [...exchanges].reverse();
}

/** Os pedidos de orientação que a sessão enxerga. */
export function useContentRequests() {
  return useQuery({
    queryKey: contentAssistantKeys.requests(),
    queryFn: ({ signal }) => getContentRequests(signal),
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
