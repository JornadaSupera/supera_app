import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Paperclip, Send, Image as ImageIcon } from 'lucide-react';
import Avatar from '../../components/ui/avatar';
import Badge from '../../components/ui/badge';
import EmptyState from '../../components/ui/empty-state';
import Loading from '../../components/ui/loading';
import { useToast } from '../../contexts/ToastContext';
import { getConversaPorId, marcarConversaComoLida, enviarMensagem } from '../../services/mockApi';
import type { EnrichedMessage } from '../../types';

// Passa direto pelo `...rest` do `Avatar` antigo (CSS Modules) até o <span>;
// `style` inline garante a sobreposição da cor padrão do avatar independente
// da ordem das folhas de estilo no bundle final — uma className Tailwind
// teria a mesma especificidade da classe do módulo antigo e poderia perder
// o cascade dependendo da ordem de geração.
const EQUIPE_SUPERA_TINT: CSSProperties = {
  backgroundColor: 'color-mix(in srgb, var(--color-supera-empatia) 15%, transparent)',
  color: 'var(--color-supera-empatia)',
};

const CARGO_POR_EXTENSO: Record<string, string> = {
  'Onco.': 'Oncologia',
  'Enf.': 'Enfermagem',
  'Farm.': 'Farmácia',
  'Psic.': 'Psicologia',
  'Nutri.': 'Nutrição',
  'Dr.': 'Medicina',
  'Fisio.': 'Fisioterapia',
};

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
  const queryClient = useQueryClient();

  const [texto, setTexto] = useState('');
  const fimDasMensagensRef = useRef<HTMLDivElement>(null);

  const {
    data: conversa,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => getConversaPorId(id ?? ''),
    enabled: Boolean(id),
  });

  const marcarComoLidaMutation = useMutation({
    mutationFn: marcarConversaComoLida,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
    },
  });

  const enviarMensagemMutation = useMutation({
    mutationFn: (textoMensagem: string) => enviarMensagem(id ?? '', textoMensagem),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Espelha o `marcarConversaComoLida(id)` "fire-and-forget" do efeito de
  // busca original: dispara uma vez por conversa carregada, sem bloquear a
  // tela. Depende só de `conversa?.id` (primitivo, estável entre refetches
  // da mesma conversa) para não reexecutar a cada invalidação de cache.
  useEffect(() => {
    if (conversa) {
      marcarComoLidaMutation.mutate(conversa.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversa?.id]);

  useEffect(() => {
    fimDasMensagensRef.current?.scrollIntoView({ block: 'end' });
  }, [conversa?.mensagens]);

  function handleEnviar() {
    const textoParaEnviar = texto.trim();
    if (!textoParaEnviar || enviarMensagemMutation.isPending) return;

    setTexto('');
    enviarMensagemMutation.mutate(textoParaEnviar);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleEnviar();
    }
  }

  function handleAnexar() {
    showToast('O envio de arquivos não está disponível nesta demonstração.', {
      variant: 'info',
    });
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
        <EmptyState
          iconTone={undefined}
          title="Conversa não encontrada"
          description="Essa conversa pode ter sido removida."
          actionLabel="Voltar para o Chat"
          onAction={() => navigate('/chat')}
        />
      </div>
    );
  }

  const nomeCabecalho = conversa.profissional
    ? `${conversa.profissional.cargo} ${conversa.profissional.nome}`
    : 'Equipe Supera';

  const subtituloCabecalho = conversa.profissional
    ? `${conversa.assuntoInfo ? `${conversa.assuntoInfo.label} · ` : ''}${conversa.titulo}`
    : `Assunto: ${conversa.assuntoInfo ? conversa.assuntoInfo.label : conversa.titulo}`;

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
          <Avatar
            src={conversa.profissional?.foto}
            name={conversa.profissional ? conversa.profissional.nome : 'Equipe Supera'}
            size="md"
            style={conversa.profissional ? undefined : EQUIPE_SUPERA_TINT}
          />
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-[14px] font-semibold text-foreground">{nomeCabecalho}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtituloCabecalho}</p>
          </div>
          {!conversa.profissional && conversa.assuntoInfo && (
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
              if (mensagem.tipo === 'sistema') {
                return (
                  <div key={mensagem.id} className="flex justify-center">
                    <span className="rounded-full border border-border bg-[color-mix(in_srgb,var(--color-muted)_40%,transparent)] px-2.5 py-1 text-center text-[11px] text-muted-foreground">
                      {mensagem.texto}
                    </span>
                  </div>
                );
              }

              if (mensagem.autor === 'paciente') {
                const statusLabel = mensagem.statusEnvio
                  ? `${mensagem.horaLabel} · ${mensagem.statusEnvio === 'enviada' ? 'Enviada' : 'Lida'}`
                  : mensagem.horaLabel;

                return (
                  <div key={mensagem.id} className="ml-auto flex max-w-[85%] flex-col items-end">
                    {mensagem.tipo === 'imagem' ? (
                      <div className="flex aspect-[4/3] w-[180px] flex-col items-center justify-center gap-2 rounded-xl rounded-br-md border border-[color-mix(in_srgb,var(--color-primary)_25%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)]">
                        <ImageIcon size={28} strokeWidth={1.5} className="text-primary" aria-hidden="true" />
                        {mensagem.legenda && (
                          <span className="px-2 text-center text-[11px] text-primary">{mensagem.legenda}</span>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl rounded-br-md bg-primary px-3.5 py-2.5 text-[14px] leading-[1.5] whitespace-pre-wrap break-words text-primary-foreground">
                        {mensagem.texto}
                      </div>
                    )}
                    <span className="mt-1 text-[10px] text-muted-foreground">{statusLabel}</span>
                  </div>
                );
              }

              // Restam aqui mensagens de `profissional`/`automatica`. `tipo`
              // ainda pode ser 'texto' OU 'imagem' (o campo `autor` não é o
              // discriminante do union `Message` — os dois variam de forma
              // independente no tipo, mesmo que o mock atual só produza
              // imagem vinda do paciente). Sem esse narrowing por `tipo`,
              // `mensagem.texto` não compila: `ImageMessage` não tem essa
              // chave.
              const ehAutomatica = mensagem.autor === 'automatica';
              const nomeAutor = ehAutomatica
                ? 'Equipe Supera'
                : `${conversa.profissional?.cargo ?? ''} ${conversa.profissional?.nome ?? ''}`.trim();
              const cargoExtenso = ehAutomatica
                ? 'automática'
                : conversa.profissional
                  ? (CARGO_POR_EXTENSO[conversa.profissional.cargo] ?? conversa.profissional.cargo)
                  : '';
              const corpoMensagem = mensagem.tipo === 'imagem' ? (mensagem.legenda ?? '📷 Imagem') : mensagem.texto;

              return (
                <div key={mensagem.id} className="flex max-w-[85%] flex-col items-start">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Avatar
                      size="sm"
                      src={mensagem.autor === 'profissional' ? conversa.profissional?.foto : null}
                      name={mensagem.autor === 'profissional' ? conversa.profissional?.nome : 'Equipe Supera'}
                      style={mensagem.autor === 'automatica' ? EQUIPE_SUPERA_TINT : undefined}
                    />
                    <span>
                      {nomeAutor} · {cargoExtenso}
                    </span>
                  </div>
                  <div className="rounded-xl rounded-bl-md border border-border bg-card px-3.5 py-2.5 text-[14px] leading-[1.5] whitespace-pre-wrap break-words text-foreground">
                    {corpoMensagem}
                  </div>
                  <span className="mt-1 text-[10px] text-muted-foreground">{mensagem.horaLabel}</span>
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
    </div>
  );
}
