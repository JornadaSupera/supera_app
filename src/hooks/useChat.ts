import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  enviarMensagem,
  getConversaPorId,
  getConversas,
  getConversationSubjects,
  iniciarConversa,
  marcarConversaComoLida,
  subscribeToChat,
} from '../services/mockApi';
import type { StartConversationInput } from '../types';

// Hooks do Chat. Leitura por `.from()` sob RLS; abrir conversa e marcar como
// lida são RPC; enviar mensagem é `.insert()` direto — o único caminho quente
// do projeto que dispensa RPC, porque a linha imutável já é a trilha.

/** Catálogo de assuntos. Muda raramente, e o id é o que abre a conversa. */
export function useConversationSubjects() {
  return useQuery({
    queryKey: ['conversation-subjects'],
    queryFn: getConversationSubjects,
    staleTime: 1000 * 60 * 30,
  });
}

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: getConversas,
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: ['conversation', id],
    queryFn: () => getConversaPorId(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Marca a conversa como lida.
 *
 * Sem tratamento de erro na tela: falhar aqui não impede ler a conversa, e um
 * toast de erro sobre uma ação que o paciente nem pediu seria ruído. A
 * contagem se corrige na próxima abertura.
 */
export function useMarkConversationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: marcarConversaComoLida,
    onSuccess: (_data, conversationId) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      // O indicador de mensagens da Home lê a mesma contagem.
      void queryClient.invalidateQueries({ queryKey: ['unread-conversations'] });
    },
  });
}

/**
 * Envia uma mensagem na conversa.
 *
 * Sem atualização otimista: a mensagem é imutável e o servidor é quem atribui
 * id e horário. Fingir que chegou, e depois ter que remover a bolha porque a
 * conversa estava encerrada, seria pior que esperar a confirmação.
 */
export function useSendMessage(conversationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (texto: string) => {
      if (!conversationId) throw new Error('Conversa não identificada.');

      return enviarMensagem(conversationId, texto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

/**
 * Mantém o chat atualizado sozinho enquanto a tela estiver montada.
 *
 * Sem `conversationId`, escuta todas as conversas (a lista). Com ele, filtra
 * as mensagens daquela conversa — a lista continua sendo invalidada porque a
 * prévia e a contagem mudam junto.
 */
export function useChatRealtime(conversationId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    return subscribeToChat(conversationId, () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['unread-conversations'] });

      if (conversationId) {
        void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      }
    });
  }, [conversationId, queryClient]);
}

/** Abre a conversa e grava a primeira mensagem — um ato só, no banco. */
export function useStartConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StartConversationInput) => iniciarConversa(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['unread-conversations'] });
    },
  });
}
