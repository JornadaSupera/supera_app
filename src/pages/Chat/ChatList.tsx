import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import ErrorState from '../../components/ui/error-state';
import TabScreen from '../../components/ui/tab-screen';
import { BrandStatusBand } from '../../components/ui/brand-cover';
import { useChatRealtime, useConversationSubjects, useConversations } from '../../hooks/useChat';
import { useBusinessHoursLabel } from '../../hooks/useClinic';
import { cn } from '../../lib/utils';
import ChatCover from './ChatCover';
import ChatNotice from './ChatNotice';
import { ChatListSkeleton } from './ChatSkeletons';
import { chatBackgroundClass, chatCardClass } from './chatStyles';
import ConversationList from './ConversationList';
import NewConversationModal from './NewConversationModal';
import SubjectGrid from './SubjectGrid';
import type { ChatSubjectOption } from '../../types';

interface ChatListLayoutProps {
  businessHours?: string | null;
  isLoading?: boolean;
  children: ReactNode;
}

/**
 * A aba do Chat: a capa verde no alto e, sobre a borda dela, os cartões
 * brancos. A mesma nos quatro estados — carregando, erro, vazio e conteúdo.
 */
export function ChatListLayout({ businessHours, isLoading = false, children }: ChatListLayoutProps) {
  return (
    <div className={cn('flex flex-1 flex-col', chatBackgroundClass)}>
      <BrandStatusBand />
      <ChatCover businessHours={businessHours} />

      {/* `relative` e margem negativa: os cartões começam sobre a borda da capa. */}
      <main aria-busy={isLoading || undefined} className="relative -mt-10 flex flex-1 flex-col gap-6 px-5 pb-8">
        {children}
      </main>
    </div>
  );
}

export default function ChatList() {
  const navigate = useNavigate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<ChatSubjectOption | null>(null);

  const {
    data: conversations = [],
    isLoading: isConversationsLoading,
    isError: isConversationsError,
    refetch: refetchConversations,
  } = useConversations();

  // Os assuntos vêm do catálogo, não de uma lista fixa no front: abrir uma
  // conversa exige o UUID da linha de `conversation_subjects`, que só o banco
  // conhece.
  const {
    data: subjects = [],
    isLoading: isSubjectsLoading,
    isError: isSubjectsError,
    refetch: refetchSubjects,
  } = useConversationSubjects();

  const { data: businessHours } = useBusinessHoursLabel();

  // Mensagem nova da equipe atualiza a lista sem o paciente precisar sair e
  // voltar da tela.
  useChatRealtime();

  function openNewConversation(subject: ChatSubjectOption) {
    setSelectedSubject(subject);
    setIsModalOpen(true);
  }

  const isLoading = isConversationsLoading || isSubjectsLoading;
  let content: ReactNode;

  if (isLoading) {
    content = <ChatListSkeleton />;
  } else if (isConversationsError || isSubjectsError) {
    content = (
      <div className={chatCardClass}>
        <ErrorState
          className="min-h-0 py-10"
          title="Não foi possível carregar suas conversas"
          onRetry={() => {
            void refetchConversations();
            void refetchSubjects();
          }}
        />
      </div>
    );
  } else {
    content = (
      <>
        <SubjectGrid subjects={subjects} onSelect={openNewConversation} />
        <ConversationList conversations={conversations} />
        <ChatNotice />
      </>
    );
  }

  return (
    <TabScreen>
      <ChatListLayout businessHours={businessHours} isLoading={isLoading}>
        {content}
      </ChatListLayout>

      <NewConversationModal
        open={isModalOpen}
        subject={selectedSubject}
        onClose={() => setIsModalOpen(false)}
        onCreated={(conversationId) => navigate(`/chat/${conversationId}`)}
      />
    </TabScreen>
  );
}
