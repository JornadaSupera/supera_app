import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams, Link } from 'react-router';
import StickyFooter from '../../components/ui/sticky-footer';
import Avatar from '../../components/ui/avatar';
import Badge from '../../components/ui/badge';
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
import { describeMessageSender, getDeliveryStatus, isImagemSemLegenda } from '../../utils/chat';
import { formatChatDayLabel } from '../../utils/date';
import { cn } from '../../lib/utils';
import ChatComposer from './ChatComposer';
import { ConversationSkeleton } from './ChatSkeletons';
import ConversationTopBar from './ConversationTopBar';
import { MessageImage, UnsentImage } from './MessageImage';
import type { EnrichedMessage, UnsentChatImage } from '../../types';

// Passa direto pelo `...rest` do `Avatar` até o <span>; `style` inline
// garante a sobreposição da cor padrão do avatar independente da ordem das
// folhas de estilo no bundle final.
const EQUIPE_SUPERA_TINT: CSSProperties = {
  backgroundColor: 'color-mix(in srgb, var(--color-supera-empatia) 15%, transparent)',
  color: 'var(--color-supera-empatia)',
};

/** Rótulo de quem atende, quando a conversa ainda não foi assumida por uma área. */
const EQUIPE_PADRAO = 'Equipe Supera';

interface GrupoDiaMensagens {
  chaveDia: string;
  label: string;
  mensagens: EnrichedMessage[];
}

function agruparMensagensPorDia(mensagens: EnrichedMessage[]): GrupoDiaMensagens[] {
  const grupos: GrupoDiaMensagens[] = [];
  let grupoAtual: GrupoDiaMensagens | null = null;

  mensagens.forEach((mensagem) => {
    const chaveDia = new Date(mensagem.data).toDateString();
    if (!grupoAtual || grupoAtual.chaveDia !== chaveDia) {
      grupoAtual = { chaveDia, label: formatChatDayLabel(mensagem.data), mensagens: [] };
      grupos.push(grupoAtual);
    }
    grupoAtual.mensagens.push(mensagem);
  });

  return grupos;
}

const bubbleTextClass = 'rounded-xl px-3.5 py-2.5 text-[14px] leading-[1.5] whitespace-pre-wrap break-words';

/** Cor da bolha de texto: primária deste lado, neutra do lado da equipe. */
function bubbleSideClass(lado: 'propria' | 'equipe'): string {
  return lado === 'propria'
    ? 'rounded-br-md bg-primary text-primary-foreground'
    : 'rounded-bl-md border border-border bg-card text-foreground';
}

interface UnsentState {
  image: UnsentChatImage;
  retrying: boolean;
  onRetry: () => void;
}

/**
 * Corpo de uma bolha de mensagem — texto ou imagem, dos dois lados da
 * conversa. Extraído porque paciente/cuidador (bolha primária) e
 * profissional/sistema (bolha neutra) precisam do mesmo comportamento de
 * imagem, só trocando a cor.
 */
function ConteudoMensagem({
  mensagem,
  lado,
  unsent,
}: {
  mensagem: EnrichedMessage;
  lado: 'propria' | 'equipe';
  /** Imagem desta mensagem que não chegou ao bucket — só existe deste lado. */
  unsent?: UnsentState;
}) {
  if (unsent) {
    return (
      <UnsentImage file={unsent.image.file} retrying={unsent.retrying} onRetry={unsent.onRetry} />
    );
  }

  if (!mensagem.anexo) {
    return <div className={cn(bubbleTextClass, bubbleSideClass(lado))}>{mensagem.texto}</div>;
  }

  // Sem legenda, `texto` é só o placeholder que o banco exige (`body` não
  // pode ser vazio) — não faz sentido mostrá-lo como se fosse uma mensagem
  // digitada.
  const legenda = isImagemSemLegenda(mensagem.texto) ? null : mensagem.texto;

  return (
    <div className="flex flex-col gap-1.5">
      <MessageImage
        storagePath={mensagem.anexo.storagePath}
        alt={legenda ?? 'Imagem enviada no chat'}
        side={lado === 'propria' ? 'own' : 'team'}
      />
      {legenda && <div className={cn(bubbleTextClass, bubbleSideClass(lado))}>{legenda}</div>}
    </div>
  );
}

export default function ChatConversation() {
  const { id } = useParams();
  const { showToast } = useToast();
  const accountId = useSessionStore((state) => state.accountId);
  const isCaregiver = useSessionStore((state) => state.isCaregiver);

  const mainRef = useRef<HTMLElement>(null);
  const fimDasMensagensRef = useRef<HTMLDivElement>(null);

  // Imagens que não subiram, com o arquivo ainda na memória — por id da
  // mensagem. Só vivem enquanto a conversa está aberta.
  const [unsentImages, setUnsentImages] = useState<ReadonlyMap<string, UnsentChatImage>>(
    () => new Map()
  );

  // A rota reaproveita esta tela ao ir de uma conversa direto para outra (o
  // toque num push, por exemplo): a foto da conversa anterior sai da memória.
  const [unsentConversationId, setUnsentConversationId] = useState(id);
  if (unsentConversationId !== id) {
    setUnsentConversationId(id);
    setUnsentImages(new Map());
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

  const marcarComoLidaMutation = useMarkConversationRead();
  const enviarMensagemMutation = useSendMessage(id);
  const enviarImagemMutation = useSendImageMessage(id);
  const retryAttachmentMutation = useRetryChatAttachment(id);

  useChatRealtime(id);

  // Cada página já vem cronológica por dentro; as páginas em si vêm da mais
  // nova para a mais antiga (ordem de busca do `useInfiniteQuery`) — inverte
  // só a ordem das páginas para montar a lista do começo ao fim.
  const mensagens = [...(messagesData?.pages ?? [])].reverse().flatMap((pagina) => pagina.mensagens);
  const ultimaMensagemId = mensagens[mensagens.length - 1]?.id;

  // Marca como lida sempre que houver o que marcar. Diferente do `read_at` de
  // Orientações, a marca d'água do chat ANDA: ela guarda até onde o paciente
  // leu, então remarcar a cada abertura com mensagem nova é o comportamento
  // correto — não um efeito colateral.
  const naoLidas = header?.naoLidas ?? 0;

  useEffect(() => {
    if (id && naoLidas > 0) {
      marcarComoLidaMutation.mutate(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, naoLidas]);

  // Chave é a mensagem mais RECENTE, não a lista inteira: carregar página
  // antiga muda a lista sem mudar o fim dela, e não deve puxar o scroll pra
  // baixo — só mensagem nova (enviada ou recebida) deve.
  useEffect(() => {
    fimDasMensagensRef.current?.scrollIntoView({ block: 'end' });
  }, [ultimaMensagemId]);

  /**
   * Carrega a página anterior preservando o que está na tela: mede a altura
   * do scroll antes, busca, e soma a diferença ao `scrollTop` depois — sem
   * isso, prepender mensagens acima empurraria a visão do paciente para
   * baixo (o navegador mantém `scrollTop`, não o conteúdo visível).
   */
  async function handleCarregarAnteriores() {
    const container = mainRef.current;
    const alturaAntes = container?.scrollHeight ?? 0;

    await fetchNextPage();

    requestAnimationFrame(() => {
      if (!container) return;
      container.scrollTop += container.scrollHeight - alturaAntes;
    });
  }

  function handleSendText(text: string, restore: () => void) {
    enviarMensagemMutation.mutate(text, {
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
    enviarImagemMutation.mutate(file, {
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

  const isLoading = isHeaderLoading || isMessagesLoading;
  const isError = isHeaderError || isMessagesError;
  const erroExibido = headerError ?? messagesError;

  if (isLoading) {
    return <ConversationSkeleton />;
  }

  if (isError || !header) {
    return (
      <div className="flex h-[100dvh] flex-col bg-background">
        <ConversationTopBar />
        {/* Conversa de outro paciente e conversa inexistente são a mesma
            resposta da RLS — a descrição vem da mensagem do service em vez de
            a tela adivinhar qual dos dois aconteceu. */}
        <ErrorState
          title="Não foi possível abrir"
          description={erroExibido instanceof Error ? erroExibido.message : undefined}
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
  const nomeCabecalho = header.especialidade ?? EQUIPE_PADRAO;
  const grupos = agruparMensagensPorDia(mensagens);
  const viewer = { accountId, isCaregiver };

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <ConversationTopBar>
        <Avatar src={null} name={nomeCabecalho} size="md" style={EQUIPE_SUPERA_TINT} />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[14px] font-semibold text-foreground">{nomeCabecalho}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">Assunto: {header.titulo}</p>
        </div>
        {header.assuntoInfo && (
          <Badge tone="secondary" size="sm" className="ml-auto shrink-0">
            {header.assuntoInfo.label}
          </Badge>
        )}
      </ConversationTopBar>

      <main ref={mainRef} className="flex flex-1 flex-col gap-6 overflow-x-clip overflow-y-auto overscroll-x-none p-4">
        {hasNextPage && (
          <div className="flex justify-center">
            <button
              type="button"
              className="flex h-11 min-w-[220px] cursor-pointer items-center justify-center rounded-full border border-border bg-card px-4 text-[12px] font-medium text-muted-foreground transition-colors duration-150 ease-[ease] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleCarregarAnteriores}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? <Spinner size="sm" /> : 'Carregar mensagens anteriores'}
            </button>
          </div>
        )}

        {grupos.map((grupo) => (
          <div
            key={grupo.chaveDia}
            className="flex flex-col gap-3"
            // Mitigação imediata contra o custo de layout/paint de uma
            // conversa longa: o navegador pula o trabalho de grupos fora da
            // tela até que rolem para perto dela. `containIntrinsicSize` é só
            // uma estimativa de altura para a rolagem não pular antes disso —
            // o navegador corrige sozinho ao medir o grupo de verdade.
            style={{ contentVisibility: 'auto', containIntrinsicSize: '0 400px' }}
          >
            <div className="flex justify-center">
              <span className="rounded-full border border-border bg-card px-3 py-0.5 text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
                {grupo.label}
              </span>
            </div>

            {grupo.mensagens.map((mensagem) => {
              // Mensagem de sistema: transferência entre áreas ou resposta
              // fora do horário, gerada pelo próprio banco. Vai centralizada,
              // sem autor.
              if (mensagem.autor === 'sistema') {
                return (
                  <div key={mensagem.id} className="flex justify-center">
                    <span className="rounded-full border border-border bg-[color-mix(in_srgb,var(--color-muted)_40%,transparent)] px-2.5 py-1 text-center text-[11px] text-muted-foreground">
                      {mensagem.texto}
                    </span>
                  </div>
                );
              }

              // Paciente e acompanhante ficam do mesmo lado: quem escreve é
              // este lado da conversa. Quem não escreveu a mensagem vê de quem
              // ela é (`describeMessageSender`).
              if (mensagem.autor === 'paciente' || mensagem.autor === 'cuidador') {
                const unsentImage = unsentImages.get(mensagem.id);
                const status = getDeliveryStatus(mensagem, header.teamLastReadAt);
                // Com a imagem por reenviar, "Enviada" diria o contrário do
                // aviso logo acima: fica só a hora.
                const statusLabel =
                  status && !unsentImage
                    ? `${mensagem.horaLabel} · ${status === 'enviada' ? 'Enviada' : 'Lida'}`
                    : mensagem.horaLabel;
                const sender = describeMessageSender(mensagem, viewer);

                return (
                  <div key={mensagem.id} className="ml-auto flex max-w-[85%] flex-col items-end">
                    {sender && (
                      <span className="mb-1 text-[11px] text-muted-foreground">{sender}</span>
                    )}
                    <ConteudoMensagem
                      mensagem={mensagem}
                      lado="propria"
                      unsent={
                        unsentImage && {
                          image: unsentImage,
                          retrying:
                            retryAttachmentMutation.isPending &&
                            retryAttachmentMutation.variables?.pending.messageId === mensagem.id,
                          onRetry: () => handleRetryImage(unsentImage),
                        }
                      }
                    />
                    <span className="mt-1 text-[10px] text-muted-foreground">{statusLabel}</span>
                  </div>
                );
              }

              return (
                <div key={mensagem.id} className="flex max-w-[85%] flex-col items-start">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Avatar size="sm" src={null} name={nomeCabecalho} style={EQUIPE_SUPERA_TINT} />
                    <span>{nomeCabecalho}</span>
                  </div>
                  <ConteudoMensagem mensagem={mensagem} lado="equipe" />
                  <span className="mt-1 text-[10px] text-muted-foreground">
                    {mensagem.horaLabel}
                  </span>
                </div>
              );
            })}
          </div>
        ))}

        {/* O horário vem do banco (a aba Atendimento do painel). Sem horário
            configurado, nada aparece: a tela não promete prazo de resposta
            que ninguém definiu. */}
        {businessHours && (
          <div className="mx-auto max-w-[90%] rounded-lg border border-dashed border-border bg-[color-mix(in_srgb,var(--color-muted)_30%,transparent)] p-2.5 text-center text-[11px] text-muted-foreground">
            A equipe responde no horário de atendimento: {businessHours}.
          </div>
        )}

        <div ref={fimDasMensagensRef} />
      </main>

      {header.aberta ? (
        <ChatComposer
          isSendingText={enviarMensagemMutation.isPending}
          isSendingImage={enviarImagemMutation.isPending}
          onSendText={handleSendText}
          onSendImage={handleSendImage}
        />
      ) : (
        // Conversa resolvida não aceita mensagem nova — a política de INSERT
        // exige `status = 'open'`. Melhor dizer isso do que deixar o paciente
        // escrever e só descobrir no envio.
        <StickyFooter density="compact" className="z-10 shrink-0 text-center">
          <p className="text-[12px] text-muted-foreground">
            Esta conversa foi encerrada pela equipe.{' '}
            <Link to="/chat" className="font-medium text-primary underline-offset-2 hover:underline">
              Iniciar nova conversa
            </Link>
          </p>
        </StickyFooter>
      )}
    </div>
  );
}
