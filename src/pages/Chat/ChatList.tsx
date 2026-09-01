import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { Clock, MessageCircle } from 'lucide-react';
import Loading from '../../components/ui/loading';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import BottomTab from '../../components/ui/bottom-tab';
import ConversationListItem from './ConversationListItem';
import NewConversationModal from './NewConversationModal';
import { useChatRealtime, useConversationSubjects, useConversations } from '../../hooks/useChat';
import type { ChatSubjectOption } from '../../types';

export default function ChatList() {
  const navigate = useNavigate();

  const [modalAberto, setModalAberto] = useState(false);
  const [assuntoSelecionado, setAssuntoSelecionado] = useState<ChatSubjectOption | null>(null);

  const {
    data: conversas,
    isLoading: carregandoConversas,
    isError: erroConversas,
    refetch: recarregarConversas,
  } = useConversations();

  // Os assuntos vêm do catálogo, não de uma lista fixa no front: abrir uma
  // conversa exige o UUID da linha de `conversation_subjects`, que só o banco
  // conhece.
  const {
    data: assuntos = [],
    isLoading: carregandoAssuntos,
    isError: erroAssuntos,
    refetch: recarregarAssuntos,
  } = useConversationSubjects();

  // Mensagem nova da equipe atualiza a lista sem o paciente precisar sair e
  // voltar da tela.
  useChatRealtime();

  function abrirModalNovaConversa(assunto: ChatSubjectOption) {
    setAssuntoSelecionado(assunto);
    setModalAberto(true);
  }

  if (carregandoConversas || carregandoAssuntos) {
    return <Loading />;
  }

  if (erroConversas || erroAssuntos) {
    return (
      <ErrorState
        title="Não foi possível carregar suas conversas"
        onRetry={() => {
          void recarregarConversas();
          void recarregarAssuntos();
        }}
      />
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-[color-mix(in_srgb,var(--color-background)_95%,transparent)] px-6 pt-6 pb-4 backdrop-blur-[8px]">
        <p className="text-[12px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
          CHAT COM A EQUIPE
        </p>
        <h1 className="mt-0.5 text-[24px] font-semibold tracking-[-0.6px] text-foreground">
          Como podemos ajudar?
        </h1>
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Clock size={13} strokeWidth={2} className="shrink-0" aria-hidden="true" />
          Equipe online: <strong>seg–sex, 08h–18h</strong>
        </p>
      </header>

      <main className="flex flex-1 flex-col gap-6 px-6 pt-5 pb-8">
        <section>
          <h2 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
            INICIAR NOVA CONVERSA
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {assuntos.map((assunto) => {
              // `info` é `null` para um assunto cadastrado no banco que o app
              // ainda não conhece: cai no ícone neutro em vez de sumir da
              // tela, o que deixaria o paciente sem como falar sobre ele.
              const Icon = assunto.info?.icon ?? MessageCircle;
              const cor = assunto.info?.colorVar;

              return (
                <button
                  type="button"
                  key={assunto.id}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-border bg-card p-3.5 text-left transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm"
                  onClick={() => abrirModalNovaConversa(assunto)}
                >
                  <span
                    className={
                      cor
                        ? 'flex h-8 w-8 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--assunto-color)_15%,transparent)] text-[var(--assunto-color)]'
                        : 'flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground'
                    }
                    // Custom property: a cor muda por assunto, então não há
                    // classe Tailwind estática única que a expresse — mesmo
                    // mecanismo de `components/ui/badge.tsx`/`tag.tsx`.
                    style={cor ? ({ '--assunto-color': cor } as CSSProperties) : undefined}
                  >
                    <Icon size={16} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className="text-[14px] font-medium text-foreground">{assunto.label}</span>
                  {assunto.info && (
                    <span className="line-clamp-2 text-[11px] text-muted-foreground">
                      {assunto.info.descricao}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
            CONVERSAS
          </h2>
          {!conversas || conversas.length === 0 ? (
            <EmptyState
              iconTone={undefined}
              title="Nenhuma conversa ainda"
              description="Inicie uma conversa com a equipe quando precisar."
              actionLabel={undefined}
              onAction={undefined}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {conversas.map((conversa) => (
                <ConversationListItem conversa={conversa} key={conversa.id} />
              ))}
            </div>
          )}
        </section>

        <p className="rounded-lg bg-[color-mix(in_srgb,var(--color-destructive)_6%,transparent)] px-4 py-3 text-[12px] text-muted-foreground">
          Em caso de urgência fora do horário, procure o pronto atendimento ou emergência mais
          próximo.
        </p>
      </main>

      <BottomTab />

      <NewConversationModal
        open={modalAberto}
        assunto={assuntoSelecionado}
        onClose={() => setModalAberto(false)}
        onCriada={(novoId) => navigate(`/chat/${novoId}`)}
      />
    </div>
  );
}
