import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock } from 'lucide-react';
import Loading from '../../components/ui/loading';
import EmptyState from '../../components/ui/empty-state';
import BottomTab from '../../components/ui/bottom-tab';
import ConversationListItem from './ConversationListItem';
import NewConversationModal from './NewConversationModal';
import { getConversas } from '../../services/mockApi';
import { ASSUNTOS } from '../../utils/chat';
import type { ChatSubject } from '../../types';

const CHAVES_ASSUNTOS: ChatSubject[] = ['medicacao', 'agendamento', 'sintomas', 'outros'];

export default function ChatList() {
  const navigate = useNavigate();

  const [modalAberto, setModalAberto] = useState(false);
  const [assuntoSelecionado, setAssuntoSelecionado] = useState<ChatSubject | null>(null);

  const {
    data: conversas,
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ['conversations'], queryFn: getConversas });

  function abrirModalNovaConversa(assunto: ChatSubject) {
    setAssuntoSelecionado(assunto);
    setModalAberto(true);
  }

  if (isLoading) {
    return <Loading />;
  }

  if (isError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        iconTone={undefined}
        title="Não foi possível carregar suas conversas"
        description="Verifique sua conexão e tente novamente."
        actionLabel="Tentar novamente"
        onAction={() => refetch()}
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
            {CHAVES_ASSUNTOS.map((chave) => {
              const assunto = ASSUNTOS[chave];
              const Icon = assunto.icon;

              return (
                <button
                  type="button"
                  key={chave}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-border bg-card p-3.5 text-left transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm"
                  onClick={() => abrirModalNovaConversa(chave)}
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--assunto-color)_15%,transparent)] text-[var(--assunto-color)]"
                    // Custom property: a cor muda por assunto (4 valores
                    // diferentes), então não há classe Tailwind estática
                    // única que a expresse — mesmo mecanismo de
                    // `components/ui/badge.tsx`/`tag.tsx`.
                    style={{ '--assunto-color': assunto.colorVar } as CSSProperties}
                  >
                    <Icon size={16} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className="text-[14px] font-medium text-foreground">{assunto.label}</span>
                  <span className="line-clamp-2 text-[11px] text-muted-foreground">{assunto.descricao}</span>
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
