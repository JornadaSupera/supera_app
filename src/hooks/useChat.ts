import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { AppError, isTransientError } from '../lib/appError';
import { findOpenConversation } from '../utils/chat';
import { useScopeAllowed } from './useCaregiver';
import {
  CHAT_ATTACHMENT_MISSING,
  downloadChatAttachment,
  sendImageMessage,
  sendMessage,
  getConversationHeader,
  getConversationMessages,
  getConversations,
  getUnreadConversationsSummary,
  getConversationSubjects,
  startConversation,
  markConversationRead,
  retryChatAttachment,
  subscribeToChat,
} from '../services/chat';
import { useSessionStore } from '../stores/sessionStore';
import type { ConversationLocationState, PendingChatAttachment, StartConversationInput } from '../types';

// Hooks do Chat. Leitura por `.from()` sob RLS; abrir conversa e marcar como
// lida são RPC; enviar mensagem é `.insert()` direto — o único caminho quente
// do projeto que dispensa RPC, porque a linha imutável já é a trilha.

/**
 * Chaves hierárquicas do domínio: raiz única (`all`). O antigo "detalhe da
 * conversa" virou duas famílias — `conversationHeader` (tudo, exceto
 * mensagens) e `conversationMessages` (paginada, ver `useConversationMessages`)
 * — porque embutir o histórico inteiro a cada abertura era o que fazia a
 * conversa crescer sem teto.
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
  attachment: (storagePath: string | null) => [...chatKeys.all, 'attachment', storagePath] as const,
};

/** Catálogo de assuntos. Muda raramente, e o id é o que abre a conversa. */
export function useConversationSubjects() {
  return useQuery({
    queryKey: chatKeys.subjectsCatalog(),
    queryFn: getConversationSubjects,
    staleTime: 1000 * 60 * 30,
  });
}

/** Lista de conversas, com a última mensagem como prévia. */
export function useConversations() {
  return useQuery({
    queryKey: chatKeys.conversations(),
    // `signal`: sair da tela no meio da leitura cancela o pedido de verdade.
    queryFn: ({ signal }) => getConversations(signal),
  });
}

/** Tudo sobre a conversa, exceto as mensagens — ver `useConversationMessages`. */
export function useConversationHeader(id: string | undefined) {
  return useQuery({
    queryKey: chatKeys.conversationHeader(id),
    queryFn: ({ signal }) => getConversationHeader(id as string, signal),
    enabled: Boolean(id),
  });
}

/**
 * Mensagens da conversa, paginadas do fim para o começo (a mais recente
 * primeiro). `data.pages[0]` é sempre a página mais nova — quem consome
 * inverte a ordem das páginas (não das mensagens dentro de cada uma) para
 * montar a lista cronológica.
 *
 * Não depende mais do cabeçalho: o "Lida" sai na tela, de `teamLastReadAt`
 * (`getDeliveryStatus`), e as duas leituras correm juntas ao abrir a conversa.
 */
export function useConversationMessages(conversationId: string | undefined) {
  return useInfiniteQuery({
    queryKey: chatKeys.conversationMessages(conversationId),
    queryFn: ({ pageParam, signal }) =>
      getConversationMessages(conversationId as string, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(conversationId),
  });
}

/** Contagem de mensagens não lidas de todas as conversas — Home e aba Chat. */
export function useUnreadConversationsCount() {
  return useQuery({
    queryKey: chatKeys.unreadCount(),
    queryFn: ({ signal }) => getUnreadConversationsSummary(signal),
  });
}

function isMissingChatAttachment(error: unknown): boolean {
  return error instanceof AppError && error.code === CHAT_ATTACHMENT_MISSING;
}

/**
 * O arquivo de uma imagem do chat, baixado pela Storage API (o guia não tem
 * emissor de link). O `Blob` fica só no cache em memória; a tela o mostra por
 * `useObjectUrl`.
 *
 * - `staleTime: Infinity`: o anexo é imutável — o bucket não sobrescreve nem
 *   apaga (guia §7).
 * - `gcTime` curto: é imagem de saúde, e não precisa ficar na memória depois
 *   que a conversa fecha.
 * - "Não encontrado" logo depois da mensagem costuma ser upload em curso — a
 *   linha do anexo chega pelo Realtime antes do arquivo. Por isso esse erro
 *   também é repetido, três vezes, com espera crescente (1 s, 2 s, 4 s).
 */
export function useChatAttachment(storagePath: string | null) {
  return useQuery({
    queryKey: chatKeys.attachment(storagePath),
    queryFn: ({ signal }) => downloadChatAttachment(storagePath as string, signal),
    enabled: Boolean(storagePath),
    staleTime: Infinity,
    gcTime: 1000 * 60 * 5,
    retry: (failureCount, error) =>
      failureCount < 3 && (isTransientError(error) || isMissingChatAttachment(error)),
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
    mutationFn: markConversationRead,
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

      return sendMessage(conversationId, texto, isCaregiver ? 'caregiver' : 'patient');
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
 * Mesma filosofia de `useSendMessage`: sem prévia otimista. O resultado diz se
 * o arquivo subiu (`pending: null`) ou o que falta para reenviá-lo — a
 * mensagem já existe e não se apaga, então quem decide oferecer "Reenviar" é a
 * tela, que ainda tem o arquivo na memória.
 */
export function useSendImageMessage(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  const isCaregiver = useSessionStore((state) => state.isCaregiver);

  return useMutation({
    mutationFn: async (file: File) => {
      if (!conversationId) throw new Error('Conversa não identificada.');

      return sendImageMessage(conversationId, file, isCaregiver ? 'caregiver' : 'patient');
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversationMessages(conversationId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
      // A bolha pode ter pedido a imagem antes de o arquivo terminar de subir
      // (o Realtime avisa na hora da linha do anexo): relê agora que subiu.
      if (!result.pending) {
        void queryClient.invalidateQueries({ queryKey: chatKeys.attachment(result.storagePath) });
      }
    },
  });
}

/** Reenvia o arquivo de uma imagem cuja mensagem já existe (`sendImageMessage` → `pending`). */
export function useRetryChatAttachment(conversationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ pending, file }: { pending: PendingChatAttachment; file: File }) =>
      retryChatAttachment(pending, file),
    onSuccess: (_data, { pending }) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversationMessages(conversationId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.attachment(pending.storagePath) });
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
 *
 * O "Lida" vem do cabeçalho: quando a equipe lê, `conversations` muda, o
 * cabeçalho é relido e a tela recalcula o estado de cada mensagem.
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

/**
 * "Falar com a equipe" a partir de outra tela (compromisso da Agenda, registro
 * do Diário): reabre a conversa ABERTA do assunto, se houver, com `draft` já
 * no campo de digitar; só sem nenhuma aberta oferece a "Nova conversa". Antes
 * cada toque abria uma conversa nova, e a equipe recebia várias sobre o mesmo
 * assunto.
 *
 * A tela desenha o `NewConversationModal` com `modalProps`. Sem a lista de
 * conversas confirmada (ainda carregando ou com erro), sem o assunto no
 * catálogo ou para o acompanhante sem a área do Chat, o toque leva à lista do
 * Chat — lá aparecem as conversas que existem, e o aviso de área retirada.
 * Nunca se arrisca abrir uma conversa repetida por não saber.
 *
 * `available` diz se o botão deve existir: ao acompanhante sem a área do Chat
 * a tela nem oferece "Falar com a equipe".
 */
export function useTeamConversation(subjectCode: string, draft = '') {
  const navigate = useNavigate();
  const { allowed: chatAllowed } = useScopeAllowed('chat');
  const { data: subjects } = useConversationSubjects();
  const { data: conversations, isSuccess: conversationsLoaded } = useConversations();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const subject = subjects?.find((item) => item.code === subjectCode) ?? null;

  function talkToTeam() {
    if (!chatAllowed || !conversationsLoaded || !subject) {
      navigate('/chat');
      return;
    }

    const existing = findOpenConversation(conversations, subjectCode);
    if (existing) {
      const state: ConversationLocationState | undefined = draft ? { draft } : undefined;
      navigate(`/chat/${existing.id}`, { state });
      return;
    }

    setIsModalOpen(true);
  }

  return {
    available: chatAllowed,
    talkToTeam,
    modalProps: {
      open: isModalOpen,
      subject,
      initialText: draft,
      onClose: () => setIsModalOpen(false),
      onCreated: (conversationId: string) => navigate(`/chat/${conversationId}`),
    },
  };
}

/** Abre a conversa e grava a primeira mensagem — um ato só, no banco. */
export function useStartConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StartConversationInput) => startConversation(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
      void queryClient.invalidateQueries({ queryKey: chatKeys.unreadCount() });
    },
  });
}
