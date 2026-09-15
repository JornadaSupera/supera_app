import { useEffect } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  enviarImagemMensagem,
  enviarMensagem,
  getConversationHeader,
  getConversationMessages,
  getConversas,
  getConversasNaoLidas,
  getConversationSubjects,
  iniciarConversa,
  marcarConversaComoLida,
  subscribeToChat,
} from '../services/mockApi';
import { useSessionStore } from '../stores/sessionStore';
import type { StartConversationInput } from '../types';

// Hooks do Chat. Leitura por `.from()` sob RLS; abrir conversa e marcar como
// lida são RPC; enviar mensagem é `.insert()` direto — o único caminho quente
// do projeto que dispensa RPC, porque a linha imutável já é a trilha.

/**
 * Chaves hierárquicas do domínio: raiz única (`all`). O antigo "detalhe da
 * conversa" virou duas famílias — `conversationHeader` (tudo, exceto
 * mensagens) e `conversationMessages` (paginada, ver `useConversationMessages`)
 * — porque embutir o histórico inteiro a cada abertura era o que fazia a
 * conversa crescer sem teto (achado de auditoria).
 */
export const chatKeys = {
  all: ['chat'] as const,
  subjectsCatalog: () => [...chatKeys.all, 'subjects'] as const,
  unreadCount: () => [...chatKeys.all, 'unread-count'] as const,
  conversations: () => [...chatKeys.all, 'conversations'] as const,
  conversationHeaders: () => [...chatKeys.all, 'conversation-header'] as const,
  conversationHeader: (id: string | undefined) =>
    [...chatKeys.conversationHeaders(), id] as const,
  conversationMessages: (id: string | undefined) =>
    [...chatKeys.all, 'conversation-messages', id] as const,
};

/** Catálogo de assuntos. Muda raramente, e o id é o que abre a conversa. */
export function useConversationSubjects() {
  return useQuery({
    queryKey: chatKeys.subjectsCatalog(),
    queryFn: getConversationSubjects,
    staleTime: 1000 * 60 * 30,
  });
}

export function useConversations() {
  return useQuery({
    queryKey: chatKeys.conversations(),
    queryFn: getConversas,
  });
}

/** Tudo sobre a conversa, exceto as mensagens — ver `useConversationMessages`. */
export function useConversationHeader(id: string | undefined) {
  return useQuery({
    queryKey: chatKeys.conversationHeader(id),
    queryFn: () => getConversationHeader(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Mensagens da conversa, paginadas do fim para o começo (a mais recente
 * primeiro). `data.pages[0]` é sempre a página mais nova — quem consome
 * inverte a ordem das páginas (não das mensagens dentro de cada uma) para
 * montar a lista cronológica. `teamLastReadAt` vem do cabeçalho porque cada
 * mensagem precisa dele para saber se está "lida".
 */
export function useConversationMessages(
  conversationId: string | undefined,
  teamLastReadAt: string | null | undefined
) {
  return useInfiniteQuery({
    queryKey: chatKeys.conversationMessages(conversationId),
    queryFn: ({ pageParam }) =>
      getConversationMessages(conversationId as string, pageParam, teamLastReadAt ?? null),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // Só busca depois que o cabeçalho resolveu: sem `teamLastReadAt` ainda,
    // toda mensagem apareceria como "Enviada" até a primeira revalidação.
    enabled: Boolean(conversationId) && teamLastReadAt !== undefined,
  });
}

/** Contagem de conversas com mensagem não lida — prévia da Home. */
export function useUnreadConversationsCount() {
  return useQuery({
    queryKey: chatKeys.unreadCount(),
    queryFn: getConversasNaoLidas,
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
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversationHeader(conversationId) });
      // O indicador de mensagens da Home lê a mesma contagem.
      void queryClient.invalidateQueries({ queryKey: chatKeys.unreadCount() });
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
  const isCaregiver = useSessionStore((state) => state.isCaregiver);

  return useMutation({
    mutationFn: async (texto: string) => {
      if (!conversationId) throw new Error('Conversa não identificada.');

      return enviarMensagem(conversationId, texto, isCaregiver ? 'caregiver' : 'patient');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversationMessages(conversationId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
    },
  });
}

/**
 * Envia uma imagem na conversa.
 *
 * Mesma filosofia de `useSendMessage`: sem prévia otimista. Uma bolha de
 * imagem que "chegou" antes de o upload terminar, e depois falha, é pior
 * do que esperar a URL assinada de volta.
 */
export function useSendImageMessage(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  const isCaregiver = useSessionStore((state) => state.isCaregiver);

  return useMutation({
    mutationFn: async (file: File) => {
      if (!conversationId) throw new Error('Conversa não identificada.');

      return enviarImagemMensagem(conversationId, file, isCaregiver ? 'caregiver' : 'patient');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversationMessages(conversationId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
    },
  });
}

/**
 * Mantém o chat atualizado sozinho enquanto a tela estiver montada.
 *
 * Sem `conversationId`, escuta todas as conversas (a lista). Com ele, filtra
 * as mensagens daquela conversa — a lista continua sendo invalidada porque a
 * prévia e a contagem mudam junto. Invalidar `conversationMessages` refaz só
 * as páginas já carregadas (o que o paciente rolou até agora), não o
 * histórico inteiro — é o TanStack Query revalidando cada página ativa.
 */
export function useChatRealtime(conversationId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    return subscribeToChat(conversationId, () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
      void queryClient.invalidateQueries({ queryKey: chatKeys.unreadCount() });

      if (conversationId) {
        void queryClient.invalidateQueries({ queryKey: chatKeys.conversationHeader(conversationId) });
        void queryClient.invalidateQueries({ queryKey: chatKeys.conversationMessages(conversationId) });
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
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
      void queryClient.invalidateQueries({ queryKey: chatKeys.unreadCount() });
    },
  });
}
