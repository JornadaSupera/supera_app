import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowDown } from 'lucide-react';
import ErrorState from '../../components/ui/error-state';
import { Spinner } from '../../components/ui/loading';
import { useToast } from '../../contexts/ToastContext';
import {
  useChatRealtime,
  useConversationHeader,
  useConversationMessages,
  useMarkConversationRead,
  useRetryChatAttachment,
  useSendImageMessage,
  useSendMessage,
} from '../../hooks/useChat';
import { useBusinessHoursLabel } from '../../hooks/useClinic';
import { describeMutationError } from '../../hooks/useAuth';
import { useSessionStore } from '../../stores/sessionStore';
import { cn } from '../../lib/utils';
import { getDeliveryStatus, getMessageSide } from '../../utils/chat';
import ChatComposer from './ChatComposer';
import { conversationBackgroundClass } from './chatStyles';
import ChatNotice from './ChatNotice';
import { ConversationSkeleton } from './ChatSkeletons';
import ConversationTopBar, { ConversationTitle } from './ConversationTopBar';
import MessageLog from './MessageLog';
import { ChatImageViewer, type OpenChatImage } from './MessageImage';
import type { UnsentChatImage } from '../../types';

/** Quem atende, quando a conversa ainda não foi assumida por uma área. */
const DEFAULT_TEAM_NAME = 'Equipe Supera';

/** Até esta distância do fim, a conversa acompanha as mensagens que chegam. */
const NEAR_BOTTOM_PX = 120;

/**
 * A tela inteira rola, e o topo e a barra de digitar ficam presos às bordas:
 * as mensagens passam por baixo deles, e o fundo de bambus fica parado. Deitado, o contêiner vai até
 * a borda e recua o recorte por dentro (`bleed-x px-safe-0`): senão ele
 * cortaria a barra do topo, que vai de ponta a ponta.
 */
const screenClass = cn(
  'flex h-[100dvh] bleed-x flex-col overflow-x-clip overflow-y-auto overscroll-x-none overscroll-y-contain px-safe-0 [-webkit-overflow-scrolling:touch]',
  conversationBackgroundClass
);

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function ChatConversation() {
  const { id } = useParams();
  const { showToast } = useToast();
  const accountId = useSessionStore((state) => state.accountId);
  const isCaregiver = useSessionStore((state) => state.isCaregiver);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Se quem lê está no fim da conversa: é o que decide se a mensagem nova
  // puxa a tela para baixo ou só acende o aviso do botão "ir para o fim".
  const isNearBottomRef = useRef(true);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [hasUnseenMessages, setHasUnseenMessages] = useState(false);
  const [openImage, setOpenImage] = useState<OpenChatImage | null>(null);

  // Imagens que não subiram, com o arquivo ainda na memória — por id da
  // mensagem. Só vivem enquanto a conversa está aberta.
  const [unsentImages, setUnsentImages] = useState<ReadonlyMap<string, UnsentChatImage>>(
    () => new Map()
  );

  // A rota reaproveita esta tela ao ir de uma conversa direto para outra (o
  // toque num push, por exemplo): o que era da conversa anterior sai de cena.
  const [currentConversationId, setCurrentConversationId] = useState(id);
  if (currentConversationId !== id) {
    setCurrentConversationId(id);
    setUnsentImages(new Map());
    setOpenImage(null);
    setHasUnseenMessages(false);
    setIsNearBottom(true);
  }

  const {
    data: header,
    isLoading: isHeaderLoading,
    isError: isHeaderError,
    error: headerError,
    refetch: refetchHeader,
  } = useConversationHeader(id);

  // Paginada do fim para o começo — ver `useConversationMessages`. Corre junto
  // com o cabeçalho: o "Lida" sai de `teamLastReadAt` na hora de desenhar.
  const {
    data: messagesData,
    isLoading: isMessagesLoading,
    isError: isMessagesError,
    error: messagesError,
    refetch: refetchMessages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useConversationMessages(id);

  const { data: businessHours } = useBusinessHoursLabel();

  const markAsReadMutation = useMarkConversationRead();
  const sendMessageMutation = useSendMessage(id);
  const sendImageMutation = useSendImageMessage(id);
  const retryAttachmentMutation = useRetryChatAttachment(id);

  useChatRealtime(id);

  // Cada página já vem cronológica por dentro; as páginas em si vêm da mais
  // nova para a mais antiga (ordem de busca do `useInfiniteQuery`) — inverte
  // só a ordem das páginas para montar a lista do começo ao fim.
  const messages = [...(messagesData?.pages ?? [])].reverse().flatMap((page) => page.messages);
  const lastMessage = messages[messages.length - 1];
  const lastMessageId = lastMessage?.id;
  const lastMessageIsOwn = lastMessage ? getMessageSide(lastMessage) === 'own' : false;

  // Marca como lida sempre que houver o que marcar. Diferente do `read_at` de
  // Orientações, a marca d'água do chat ANDA: ela guarda até onde o paciente
  // leu, então remarcar a cada abertura com mensagem nova é o comportamento
  // correto — não um efeito colateral.
  const unreadCount = header?.unreadCount ?? 0;

  useEffect(() => {
    if (id && unreadCount > 0) {
      markAsReadMutation.mutate(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, unreadCount]);

  useEffect(() => {
    isNearBottomRef.current = true;
  }, [id]);

  function scrollToBottom(behavior: ScrollBehavior) {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  }

  // Chave é a mensagem mais RECENTE, não a lista inteira: carregar página
  // antiga muda a lista sem mudar o fim dela, e não deve puxar a tela para
  // baixo. Mensagem nova desce a tela quando quem lê já está no fim (ou quando
  // foi ele quem mandou); lendo o histórico, só acende o aviso no botão.
  useEffect(() => {
    if (!lastMessageId) return;
    if (isNearBottomRef.current || lastMessageIsOwn) {
      scrollToBottom('auto');
      setHasUnseenMessages(false);
    } else {
      setHasUnseenMessages(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessageId]);

  // Quem está no fim continua no fim quando a conversa muda de tamanho: a
  // imagem ganha a proporção dela depois de baixar, e o teclado que abre
  // encurta a tela.
  const hasContent = Boolean(header) && messages.length > 0;
  useEffect(() => {
    const container = scrollRef.current;
    const content = contentRef.current;
    if (!hasContent || !container || !content || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      if (isNearBottomRef.current) scrollToBottom('auto');
    });
    observer.observe(content);
    observer.observe(container);
    return () => observer.disconnect();
  }, [hasContent]);

  function handleScroll() {
    const container = scrollRef.current;
    if (!container) return;

    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < NEAR_BOTTOM_PX;
    isNearBottomRef.current = nearBottom;
    setIsNearBottom(nearBottom);
    if (nearBottom) setHasUnseenMessages(false);
  }

  function handleJumpToLatest() {
    scrollToBottom(prefersReducedMotion() ? 'auto' : 'smooth');
    setHasUnseenMessages(false);
  }

  /**
   * Carrega a página anterior preservando o que está na tela: mede a altura
   * da rolagem antes, busca, e soma a diferença depois — sem isso, as
   * mensagens que entram em cima empurrariam a visão do paciente para baixo
   * (o navegador mantém o `scrollTop`, não o conteúdo visível).
   */
  async function handleLoadOlder() {
    const container = scrollRef.current;
    const heightBefore = container?.scrollHeight ?? 0;

    await fetchNextPage();

    requestAnimationFrame(() => {
      if (!container) return;
      container.scrollTop += container.scrollHeight - heightBefore;
    });
  }

  function handleSendText(text: string, restore: () => void) {
    sendMessageMutation.mutate(text, {
      onError: (error) => {
        restore();
        showToast(describeMutationError(error, 'Não foi possível enviar a mensagem.'), {
          variant: 'error',
        });
      },
    });
  }

  function forgetUnsentImage(messageId: string) {
    setUnsentImages((current) => {
      const next = new Map(current);
      next.delete(messageId);
      return next;
    });
  }

  function handleSendImage(file: File) {
    sendImageMutation.mutate(file, {
      onSuccess: ({ pending }) => {
        if (!pending) return;

        // A mensagem foi criada e não se apaga; o arquivo é o que falta.
        setUnsentImages((current) => new Map(current).set(pending.messageId, { pending, file }));
        showToast('A imagem não foi enviada. Toque em "Reenviar" para tentar de novo.', {
          variant: 'error',
        });
      },
      onError: (error) => {
        showToast(describeMutationError(error, 'Não foi possível enviar a imagem.'), {
          variant: 'error',
        });
      },
    });
  }

  function handleRetryImage(image: UnsentChatImage) {
    retryAttachmentMutation.mutate(image, {
      onSuccess: () => forgetUnsentImage(image.pending.messageId),
      onError: (error) => {
        showToast(describeMutationError(error, 'Não foi possível reenviar a imagem.'), {
          variant: 'error',
        });
      },
    });
  }

  if (isHeaderLoading || isMessagesLoading) {
    return <ConversationSkeleton />;
  }

  if (isHeaderError || isMessagesError || !header) {
    const shownError = headerError ?? messagesError;

    return (
      <div className={screenClass}>
        <ConversationTopBar />
        {/* Conversa de outro paciente e conversa inexistente são a mesma
            resposta da RLS — a descrição vem da mensagem do service em vez de
            a tela adivinhar qual dos dois aconteceu. */}
        <ErrorState
          title="Não foi possível abrir"
          description={shownError instanceof Error ? shownError.message : undefined}
          onRetry={() => {
            void refetchHeader();
            void refetchMessages();
          }}
        />
      </div>
    );
  }

  // Quem atende é a ÁREA, não a pessoa: o nome do profissional não é legível
  // pelo paciente. Sem roteamento — o estado de toda conversa nova — nem área
  // existe ainda, e o interlocutor é a equipe.
  const teamName = header.specialty ?? DEFAULT_TEAM_NAME;
  const viewer = { accountId, isCaregiver };
  const retryingMessageId = retryAttachmentMutation.isPending
    ? (retryAttachmentMutation.variables?.pending.messageId ?? null)
    : null;

  // "Enviada" / "Lida pela equipe" sob a última mensagem, quando ela é deste
  // lado — é quando importa saber se a equipe já viu. Com a imagem por
  // reenviar, "Enviada" diria o contrário do aviso logo acima.
  const deliveryStatus =
    lastMessage && lastMessageIsOwn && !unsentImages.has(lastMessage.id)
      ? getDeliveryStatus(lastMessage, header.teamLastReadAt)
      : null;

  return (
    <div ref={scrollRef} className={screenClass} onScroll={handleScroll}>
      <ConversationTopBar>
        <ConversationTitle
          teamName={teamName}
          subject={header.title}
          subjectInfo={header.subjectInfo}
          isOpen={header.isOpen}
        />
      </ConversationTopBar>

      <main
        ref={contentRef}
        aria-label={`Conversa com ${teamName}`}
        className="flex flex-1 flex-col gap-5 px-4 pt-4 pb-3"
      >
        {hasNextPage ? (
          <div className="flex justify-center">
            <button
              type="button"
              className="flex h-11 min-w-[220px] cursor-pointer items-center justify-center rounded-full border border-border bg-card px-4 text-[13px] font-medium text-muted-foreground shadow-sm transition-colors duration-150 ease-[ease] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleLoadOlder}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? <Spinner size="sm" /> : 'Carregar mensagens anteriores'}
            </button>
          </div>
        ) : (
          // O começo da conversa: o que esperar da equipe e o que fazer numa
          // urgência, antes da primeira mensagem.
          <ChatNotice businessHours={businessHours} surface="conversation" />
        )}

        <MessageLog
          messages={messages}
          teamName={teamName}
          viewer={viewer}
          deliveryStatus={deliveryStatus}
          unsentImages={unsentImages}
          retryingMessageId={retryingMessageId}
          onRetryImage={handleRetryImage}
          onOpenImage={setOpenImage}
        />
      </main>

      <div className="sticky bottom-0 z-20">
        {!isNearBottom && (
          <button
            type="button"
            onClick={handleJumpToLatest}
            aria-label={hasUnseenMessages ? 'Ir para as mensagens novas' : 'Ir para a última mensagem'}
            className="glass absolute -top-14 right-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-foreground shadow-[var(--shadow-float)] ring-1 ring-[var(--glass-edge)] transition-[scale] duration-150 ease-[ease] active:scale-95 motion-safe:animate-viewer-in motion-reduce:active:scale-100"
          >
            <ArrowDown size={20} strokeWidth={2} aria-hidden="true" />
            {hasUnseenMessages && (
              <span
                aria-hidden="true"
                className="absolute top-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-card bg-[var(--color-brand-cover)]"
              />
            )}
          </button>
        )}

        {header.isOpen ? (
          <ChatComposer
            isSendingText={sendMessageMutation.isPending}
            isSendingImage={sendImageMutation.isPending}
            onSendText={handleSendText}
            onSendImage={handleSendImage}
          />
        ) : (
          // Conversa resolvida não aceita mensagem nova — a política de INSERT
          // exige `status = 'open'`. Melhor dizer isso do que deixar o paciente
          // escrever e só descobrir no envio.
          <div className="glass bleed-x flex flex-col items-center gap-0.5 border-t border-[var(--glass-edge)] px-safe-4 pt-3 pb-[calc(0.5rem_+_var(--safe-bottom))] text-center">
            <span className="text-[13px] text-muted-foreground">Esta conversa foi encerrada pela equipe.</span>
            <Link to="/chat" className="inline-flex min-h-11 cursor-pointer items-center px-3">
              <span className="text-[14px] font-semibold text-[var(--color-supera-seguranca)]">
                Iniciar nova conversa
              </span>
            </Link>
          </div>
        )}
      </div>

      <ChatImageViewer image={openImage} onClose={() => setOpenImage(null)} />
    </div>
  );
}
