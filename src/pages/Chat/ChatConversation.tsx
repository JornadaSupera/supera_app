import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import { ChevronLeft, Paperclip, Send } from 'lucide-react';
import Avatar from '../../components/ui/avatar';
import Badge from '../../components/ui/badge';
import ErrorState from '../../components/ui/error-state';
import Loading from '../../components/ui/loading';
import { useToast } from '../../contexts/ToastContext';
import {
  useChatRealtime,
  useConversation,
  useMarkConversationRead,
  useSendMessage,
} from '../../hooks/useChat';
import { describeMutationError } from '../../hooks/useAuth';
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

export default function ChatConversation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [texto, setTexto] = useState('');
  const fimDasMensagensRef = useRef<HTMLDivElement>(null);

  const { data: conversa, isLoading, isError, error, refetch } = useConversation(id);

  const marcarComoLidaMutation = useMarkConversationRead();
  const enviarMensagemMutation = useSendMessage(id);

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

  function handleAnexar() {
    showToast('O envio de arquivos ainda não está disponível.', { variant: 'info' });
  }

  if (isLoading) {
    return <Loading />;
  }

  if (isError || !conversa) {
    return (
      <div className="flex h-[100dvh] flex-col bg-background">
        <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-[color-mix(in_srgb,var(--color-card)_92%,transparent)] p-4 backdrop-blur-[8px]">
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent text-foreground transition-colors duration-150 ease-[ease] hover:bg-muted"
            onClick={() => navigate('/chat')}
            aria-label="Voltar"
          >
            <ChevronLeft size={18} strokeWidth={2} />
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
      <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-[color-mix(in_srgb,var(--color-card)_92%,transparent)] p-4 backdrop-blur-[8px]">
        <div className="flex items-center gap-3">
          <Link
            to="/chat"
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent text-foreground transition-colors duration-150 ease-[ease] hover:bg-muted"
            aria-label="Voltar"
          >
            <ChevronLeft size={18} strokeWidth={2} />
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
                    <div className="rounded-xl rounded-br-md bg-primary px-3.5 py-2.5 text-[14px] leading-[1.5] whitespace-pre-wrap break-words text-primary-foreground">
                      {mensagem.texto}
                    </div>
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
                  <div className="rounded-xl rounded-bl-md border border-border bg-card px-3.5 py-2.5 text-[14px] leading-[1.5] whitespace-pre-wrap break-words text-foreground">
                    {mensagem.texto}
                  </div>
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
        <footer className="sticky bottom-0 z-10 flex shrink-0 items-end gap-2 border-t border-border bg-[color-mix(in_srgb,var(--color-card)_92%,transparent)] px-3 py-2.5 backdrop-blur-[8px]">
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors duration-150 ease-[ease] hover:bg-muted"
            onClick={handleAnexar}
            aria-label="Anexar arquivo"
          >
            <Paperclip size={17} strokeWidth={2} />
          </button>

          <input
            type="text"
            className="min-w-0 flex-1 rounded-full border border-border bg-[color-mix(in_srgb,var(--color-muted)_30%,transparent)] px-3.5 py-2 text-[14px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            value={texto}
            onChange={(event) => setTexto(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            aria-label="Mensagem"
          />

          <button
            type="button"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-primary text-primary-foreground transition-colors duration-150 ease-[ease] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            onClick={handleEnviar}
            disabled={!podeEnviar}
            aria-label="Enviar mensagem"
          >
            <Send size={16} strokeWidth={2} />
          </button>
        </footer>
      ) : (
        // Conversa resolvida não aceita mensagem nova — a política de INSERT
        // exige `status = 'open'`. Melhor dizer isso do que deixar o paciente
        // escrever e só descobrir no envio.
        <footer className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-[color-mix(in_srgb,var(--color-card)_92%,transparent)] px-4 py-3 text-center backdrop-blur-[8px]">
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
