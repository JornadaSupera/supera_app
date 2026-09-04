import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, KeyboardEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import { ChevronLeft, Image as ImageIcon, Paperclip, Send } from 'lucide-react';
import Avatar from '../../components/ui/avatar';
import Badge from '../../components/ui/badge';
import ErrorState from '../../components/ui/error-state';
import Loading, { Spinner } from '../../components/ui/loading';
import { useToast } from '../../contexts/ToastContext';
import {
  useChatRealtime,
  useConversation,
  useMarkConversationRead,
  useSendImageMessage,
  useSendMessage,
} from '../../hooks/useChat';
import { describeMutationError } from '../../hooks/useAuth';
import { chatImageAttachmentSchema } from '../../schemas/chat';
import { isImagemSemLegenda } from '../../utils/chat';
import { cn } from '../../lib/utils';
import type { EnrichedMessage } from '../../types';

// Passa direto pelo `...rest` do `Avatar` até o <span>; `style` inline
// garante a sobreposição da cor padrão do avatar independente da ordem das
// folhas de estilo no bundle final.
const EQUIPE_SUPERA_TINT: CSSProperties = {
  backgroundColor: 'color-mix(in srgb, var(--color-supera-empatia) 15%, transparent)',
  color: 'var(--color-supera-empatia)',
};

/** Rótulo de quem atende, quando a conversa ainda não foi assumida por uma área. */
const EQUIPE_PADRAO = 'Equipe Supera';

function formatGrupoDia(data: Date): string {
  const inicioDoDia = (d: Date) => {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  };
  const diffDias = Math.round(
    (inicioDoDia(new Date()).getTime() - inicioDoDia(data).getTime()) / 86400000
  );
  if (diffDias <= 0) return 'Hoje';
  if (diffDias === 1) return 'Ontem';
  return `Há ${diffDias} dias`;
}

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
      grupoAtual = { chaveDia, label: formatGrupoDia(mensagem.data), mensagens: [] };
      grupos.push(grupoAtual);
    }
    grupoAtual.mensagens.push(mensagem);
  });

  return grupos;
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
}: {
  mensagem: EnrichedMessage;
  lado: 'propria' | 'equipe';
}) {
  if (!mensagem.anexo) {
    return (
      <div
        className={cn(
          'rounded-xl px-3.5 py-2.5 text-[14px] leading-[1.5] whitespace-pre-wrap break-words',
          lado === 'propria'
            ? 'rounded-br-md bg-primary text-primary-foreground'
            : 'rounded-bl-md border border-border bg-card text-foreground'
        )}
      >
        {mensagem.texto}
      </div>
    );
  }

  // Sem legenda, `texto` é só o placeholder que o banco exige (`body` não
  // pode ser vazio) — não faz sentido mostrá-lo como se fosse uma mensagem
  // digitada.
  const legenda = isImagemSemLegenda(mensagem.texto) ? null : mensagem.texto;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          'flex aspect-[4/3] w-[200px] items-center justify-center overflow-hidden rounded-xl border border-border bg-muted',
          lado === 'propria' ? 'rounded-br-md' : 'rounded-bl-md'
        )}
      >
        {mensagem.anexoUrl ? (
          <img
            src={mensagem.anexoUrl}
            alt={legenda ?? 'Imagem enviada no chat'}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          // Sem URL assinada: ou ainda não resolveu (o `getConversaPorId`
          // resolve o lote antes de devolver, então isso é raro), ou a
          // assinatura falhou. De qualquer forma a mensagem continua visível.
          <ImageIcon size={28} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      {legenda && (
        <div
          className={cn(
            'rounded-xl px-3.5 py-2.5 text-[14px] leading-[1.5] whitespace-pre-wrap break-words',
            lado === 'propria'
              ? 'rounded-br-md bg-primary text-primary-foreground'
              : 'rounded-bl-md border border-border bg-card text-foreground'
          )}
        >
          {legenda}
        </div>
      )}
    </div>
  );
}

export default function ChatConversation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [texto, setTexto] = useState('');
  const fimDasMensagensRef = useRef<HTMLDivElement>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  const { data: conversa, isLoading, isError, error, refetch } = useConversation(id);

  const marcarComoLidaMutation = useMarkConversationRead();
  const enviarMensagemMutation = useSendMessage(id);
  const enviarImagemMutation = useSendImageMessage(id);

  useChatRealtime(id);

  // Marca como lida sempre que houver o que marcar. Diferente do `read_at` de
  // Orientações, a marca d'água do chat ANDA: ela guarda até onde o paciente
  // leu, então remarcar a cada abertura com mensagem nova é o comportamento
  // correto — não um efeito colateral.
  const naoLidas = conversa?.naoLidas ?? 0;

  useEffect(() => {
    if (id && naoLidas > 0) {
      marcarComoLidaMutation.mutate(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, naoLidas]);

  useEffect(() => {
    fimDasMensagensRef.current?.scrollIntoView({ block: 'end' });
  }, [conversa?.mensagens]);

  function handleEnviar() {
    const textoParaEnviar = texto.trim();
    if (!textoParaEnviar || enviarMensagemMutation.isPending) return;

    setTexto('');
    enviarMensagemMutation.mutate(textoParaEnviar, {
      onError: (erro) => {
        // Devolve o texto ao campo: perder a mensagem digitada porque a
        // conversa foi encerrada seria o pior desfecho possível aqui.
        setTexto(textoParaEnviar);
        showToast(describeMutationError(erro, 'Não foi possível enviar a mensagem.'), {
          variant: 'error',
        });
      },
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleEnviar();
    }
  }

  function handleAnexarClick() {
    if (enviarImagemMutation.isPending) return;
    inputArquivoRef.current?.click();
  }

  function handleArquivoSelecionado(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Sempre limpa o valor do input: sem isso, escolher o MESMO arquivo de
    // novo depois de um erro não dispara `onChange` (o navegador só avisa
    // quando o valor muda), e o botão pareceria travado.
    event.target.value = '';

    if (!file) return;

    const validacao = chatImageAttachmentSchema.safeParse(file);
    if (!validacao.success) {
      showToast(
        validacao.error.issues[0]?.message ?? 'Não foi possível enviar essa imagem.',
        { variant: 'error' }
      );
      return;
    }

    enviarImagemMutation.mutate(file, {
      onError: (erro) => {
        showToast(describeMutationError(erro, 'Não foi possível enviar a imagem.'), {
          variant: 'error',
        });
      },
    });
  }

  if (isLoading) {
    return <Loading />;
  }

  if (isError || !conversa) {
    return (
      <div className="flex h-[100dvh] flex-col bg-background">
        <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] p-4 backdrop-blur-[8px]">
          <button
            type="button"
            className="-ml-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent text-foreground transition-colors duration-150 ease-[ease] hover:bg-muted"
            onClick={() => navigate('/chat')}
            aria-label="Voltar"
          >
            <ChevronLeft size={20} strokeWidth={2} />
          </button>
        </header>
        {/* Conversa de outro paciente e conversa inexistente são a mesma
            resposta da RLS — a descrição vem da mensagem do service em vez de
            a tela adivinhar qual dos dois aconteceu. */}
        <ErrorState
          title="Não foi possível abrir"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  // Quem atende é a ÁREA, não a pessoa: o nome do profissional não é legível
  // pelo paciente. Sem roteamento — o estado de toda conversa nova — nem área
  // existe ainda, e o interlocutor é a equipe.
  const nomeCabecalho = conversa.especialidade ?? EQUIPE_PADRAO;
  const grupos = agruparMensagensPorDia(conversa.mensagens);
  const podeEnviar = texto.trim().length > 0 && !enviarMensagemMutation.isPending;

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] p-4 backdrop-blur-[8px]">
        <div className="flex items-center gap-3">
          <Link
            to="/chat"
            className="-ml-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent text-foreground transition-colors duration-150 ease-[ease] hover:bg-muted"
            aria-label="Voltar"
          >
            <ChevronLeft size={20} strokeWidth={2} />
          </Link>
          <Avatar src={null} name={nomeCabecalho} size="md" style={EQUIPE_SUPERA_TINT} />
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-[14px] font-semibold text-foreground">{nomeCabecalho}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              Assunto: {conversa.titulo}
            </p>
          </div>
          {conversa.assuntoInfo && (
            <Badge tone="secondary" size="sm" className="ml-auto shrink-0">
              {conversa.assuntoInfo.label}
            </Badge>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        {grupos.map((grupo) => (
          <div key={grupo.chaveDia} className="flex flex-col gap-3">
            <div className="flex justify-center">
              <span className="rounded-full border border-border bg-card px-3 py-0.5 text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
                {grupo.label}
              </span>
            </div>

            {grupo.mensagens.map((mensagem) => {
              // Mensagem de sistema: transferência entre áreas, gerada pelo
              // próprio banco. Vai centralizada, sem autor.
              if (mensagem.autor === 'sistema') {
                return (
                  <div key={mensagem.id} className="flex justify-center">
                    <span className="rounded-full border border-border bg-[color-mix(in_srgb,var(--color-muted)_40%,transparent)] px-2.5 py-1 text-center text-[11px] text-muted-foreground">
                      {mensagem.texto}
                    </span>
                  </div>
                );
              }

              // Paciente e cuidador ficam do mesmo lado: quem escreve é este
              // lado da conversa. O cuidador leva rótulo para o paciente
              // saber que a mensagem não foi dele.
              if (mensagem.autor === 'paciente' || mensagem.autor === 'cuidador') {
                const statusLabel = mensagem.statusEnvio
                  ? `${mensagem.horaLabel} · ${mensagem.statusEnvio === 'enviada' ? 'Enviada' : 'Lida'}`
                  : mensagem.horaLabel;

                return (
                  <div key={mensagem.id} className="ml-auto flex max-w-[85%] flex-col items-end">
                    {mensagem.autor === 'cuidador' && (
                      <span className="mb-1 text-[11px] text-muted-foreground">
                        Enviada pelo seu acompanhante
                      </span>
                    )}
                    <ConteudoMensagem mensagem={mensagem} lado="propria" />
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

        <div className="mx-auto max-w-[90%] rounded-lg border border-dashed border-border bg-[color-mix(in_srgb,var(--color-muted)_30%,transparent)] p-2.5 text-center text-[11px] text-muted-foreground">
          Tempo médio de resposta da equipe: ~45 min em horário comercial.
        </div>

        <div ref={fimDasMensagensRef} />
      </main>

      {conversa.aberta ? (
        <footer className="sticky bottom-0 z-10 flex shrink-0 items-center gap-2 border-t border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] px-4 py-3 backdrop-blur-[8px]">
          <input
            ref={inputArquivoRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleArquivoSelecionado}
          />
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors duration-150 ease-[ease] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleAnexarClick}
            disabled={enviarImagemMutation.isPending}
            aria-label="Anexar imagem"
          >
            {enviarImagemMutation.isPending ? (
              <Spinner size="sm" />
            ) : (
              <Paperclip size={18} strokeWidth={2} />
            )}
          </button>

          <input
            type="text"
            className="h-11 min-w-0 flex-1 rounded-full border border-border bg-[color-mix(in_srgb,var(--color-muted)_30%,transparent)] px-4 text-[14px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            value={texto}
            onChange={(event) => setTexto(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            aria-label="Mensagem"
          />

          <button
            type="button"
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-primary text-primary-foreground transition-colors duration-150 ease-[ease] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            onClick={handleEnviar}
            disabled={!podeEnviar}
            aria-label="Enviar mensagem"
          >
            <Send size={18} strokeWidth={2} />
          </button>
        </footer>
      ) : (
        // Conversa resolvida não aceita mensagem nova — a política de INSERT
        // exige `status = 'open'`. Melhor dizer isso do que deixar o paciente
        // escrever e só descobrir no envio.
        <footer className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] px-4 py-3 text-center backdrop-blur-[8px]">
          <p className="text-[12px] text-muted-foreground">
            Esta conversa foi encerrada pela equipe.{' '}
            <Link to="/chat" className="font-medium text-primary underline-offset-2 hover:underline">
              Iniciar nova conversa
            </Link>
          </p>
        </footer>
      )}
    </div>
  );
}
