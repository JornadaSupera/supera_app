import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { AppError, isTransientError } from '../lib/appError';
import { useScopeAllowed } from './useCaregiver';
import {
  CHAT_ATTACHMENT_MISSING,
  downloadChatAttachment,
  getConversationHeader,
  getConversationMessages,
  getConversations,
  getUnreadConversationsSummary,
  getConversationSubjects,
  markConversationRead,
  subscribeToChat,
} from '../services/chat';

// Hooks do Chat. Leitura por `.from()` sob RLS; marcar como lida é RPC. Só
// leitura desde 21/10: a dúvida nova vai para o WhatsApp da enfermagem
// (`useTeamConversation`), e o app não grava mais mensagem nem abre conversa.

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
 * do Diário): abre o "Falar com a enfermagem" do assunto, com `draft` (o
 * contexto daquela tela) já no campo — e dali o WhatsApp da enfermagem, onde a
 * clínica atende desde 21/10.
 *
 * A tela desenha o `NewConversationModal` com `modalProps`. Sem o assunto no
 * catálogo (ainda carregando ou com erro) ou para o acompanhante sem a área do
 * Chat, o toque leva à aba do Chat — lá estão os assuntos, e o aviso de área
 * retirada.
 *
 * `available` diz se o botão deve existir: ao acompanhante sem a área do Chat
 * a tela nem oferece "Falar com a equipe".
 */
export function useTeamConversation(subjectCode: string, draft = '') {
  const navigate = useNavigate();
  const { allowed: chatAllowed } = useScopeAllowed('chat');
  const { data: subjects } = useConversationSubjects();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const subject = subjects?.find((item) => item.code === subjectCode) ?? null;

  function talkToTeam() {
    if (!chatAllowed || !subject) {
      navigate('/chat');
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
    },
  };
}
