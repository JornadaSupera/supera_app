import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Button from '../components/ui/button';
import { chatKeys } from '../hooks/useChat';
import { cn } from '../lib/utils';
import ChatComposer from '../pages/Chat/ChatComposer';
import ChatNotice from '../pages/Chat/ChatNotice';
import { ChatListSkeleton, ConversationSkeleton } from '../pages/Chat/ChatSkeletons';
import { conversationBackgroundClass } from '../pages/Chat/chatStyles';
import { ChatListLayout } from '../pages/Chat/ChatList';
import ConversationList from '../pages/Chat/ConversationList';
import ConversationTopBar, { ConversationTitle } from '../pages/Chat/ConversationTopBar';
import MessageLog from '../pages/Chat/MessageLog';
import { ChatImageViewer, type OpenChatImage } from '../pages/Chat/MessageImage';
import NewConversationModal from '../pages/Chat/NewConversationModal';
import SubjectGrid from '../pages/Chat/SubjectGrid';
import { getSubjectInfo, IMAGE_WITHOUT_CAPTION_TEXT } from '../utils/chat';
import type { ChatSubjectOption, ConversationSummary, EnrichedMessage, MessageAuthor, UnsentChatImage } from '../types';

// Peças do Chat na vitrine. A conversa real vive atrás do login; aqui dá para
// conferir o acabamento de uma conversa inteira — grupos, imagem, imagem que
// não subiu, imagem indisponível, o "Lida pela equipe" e o visualizador —, da
// lista e dos carregamentos. Tudo fictício: nenhum dado de paciente.

/** Assunto de exemplo — o id é fictício, e a vitrine nunca envia a conversa. */
const SAMPLE_SUBJECT: ChatSubjectOption = {
  id: 'vitrine',
  code: 'symptoms',
  label: 'Sintomas',
  info: getSubjectInfo('symptoms'),
};

/** Os quatro assuntos do catálogo, com ids fictícios. */
const SAMPLE_SUBJECTS: ChatSubjectOption[] = [
  { id: 'vitrine-medicacao', code: 'medication', label: 'Medicação', info: getSubjectInfo('medication') },
  { id: 'vitrine-agendamento', code: 'scheduling', label: 'Agendamento', info: getSubjectInfo('scheduling') },
  SAMPLE_SUBJECT,
  { id: 'vitrine-outros', code: 'other', label: 'Outros', info: getSubjectInfo('other') },
];

/** Caminho fictício: o cache é semeado com a imagem gerada, e nada vai ao bucket. */
const SEEDED_PATH = 'vitrine/exemplo.png';

/** Caminho que não existe: sem sessão, o download falha e a bolha mostra o aviso. */
const MISSING_PATH = 'vitrine/indisponivel.png';

const PATIENT_ACCOUNT = 'vitrine-paciente';
const VIEWER = { accountId: PATIENT_ACCOUNT, isCaregiver: false };

/** Uma mensagem de exemplo, `minutesAgo` minutos atrás. */
function sampleMessage(
  id: string,
  author: MessageAuthor,
  minutesAgo: number,
  text: string,
  storagePath?: string
): EnrichedMessage {
  const date = new Date(Date.now() - minutesAgo * 60_000);
  return {
    id,
    author,
    authorAccountId:
      author === 'patient' ? PATIENT_ACCOUNT : author === 'caregiver' ? 'vitrine-acompanhante' : null,
    text,
    createdAt: date.toISOString(),
    attachment: storagePath
      ? { id: `${id}-anexo`, storagePath, mimeType: 'image/png', byteSize: 1024 }
      : null,
    date,
    timeLabel: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}

const DAY = 24 * 60;

const SAMPLE_MESSAGES: EnrichedMessage[] = [
  sampleMessage('m1', 'patient', DAY + 90, 'Boa tarde! Depois da infusão de ontem fiquei com um pouco de enjoo.'),
  sampleMessage('m2', 'patient', DAY + 89, 'Tomei o remédio que vocês passaram, mas ainda estou sentindo.'),
  sampleMessage('m3', 'system', DAY + 60, 'A conversa foi encaminhada para a Enfermagem.'),
  sampleMessage('m4', 'professional', DAY + 30, 'Olá! Obrigada por avisar. O enjoo piora quando você se alimenta?'),
  sampleMessage('m5', 'professional', DAY + 29, 'Se puder, mande uma foto da receita que está usando.'),
  sampleMessage('m6', 'caregiver', 50, 'Aqui está a receita.', SEEDED_PATH),
  sampleMessage('m7', 'patient', 12, IMAGE_WITHOUT_CAPTION_TEXT, SEEDED_PATH),
  sampleMessage('m8', 'professional', 8, 'Recebido.', MISSING_PATH),
  sampleMessage('m9', 'patient', 3, IMAGE_WITHOUT_CAPTION_TEXT, 'vitrine/nao-enviada.png'),
  sampleMessage('m10', 'patient', 1, 'Hoje o enjoo melhorou bastante, obrigada!'),
];

const SAMPLE_CONVERSATIONS: ConversationSummary[] = [
  {
    id: 'vitrine-1',
    title: 'Sintomas',
    specialty: 'Enfermagem',
    subjectCode: 'symptoms',
    subjectInfo: getSubjectInfo('symptoms'),
    lastMessage: 'Se puder, mande uma foto da receita que está usando.',
    lastMessageHasAttachment: false,
    timeLabel: '14:32',
    lastActivityAt: new Date().toISOString(),
    unreadCount: 2,
    isOpen: true,
  },
  {
    id: 'vitrine-2',
    title: 'Medicação',
    specialty: null,
    subjectCode: 'medication',
    subjectInfo: getSubjectInfo('medication'),
    lastMessage: IMAGE_WITHOUT_CAPTION_TEXT,
    lastMessageHasAttachment: true,
    timeLabel: 'Ontem',
    lastActivityAt: new Date().toISOString(),
    unreadCount: 0,
    isOpen: true,
  },
  {
    id: 'vitrine-3',
    title: 'Agendamento',
    specialty: 'Recepção',
    subjectCode: 'scheduling',
    subjectInfo: getSubjectInfo('scheduling'),
    lastMessage: 'Sua consulta foi remarcada para quinta-feira.',
    lastMessageHasAttachment: false,
    timeLabel: '12/09',
    lastActivityAt: new Date().toISOString(),
    unreadCount: 0,
    isOpen: false,
  },
];

/** Desenha uma imagem de exemplo no canvas — nenhum arquivo de paciente. */
function drawSampleImage(): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 450;
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);

  // As cores saem dos tokens do tema, como no resto do app.
  const styles = getComputedStyle(document.documentElement);
  context.fillStyle = styles.getPropertyValue('--color-brand-cover').trim();
  context.fillRect(0, 0, 600, 450);
  context.fillStyle = styles.getPropertyValue('--color-on-brand-cover').trim();
  context.font = '600 48px sans-serif';
  context.fillText('Exemplo', 200, 240);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export default function ChatShowcase() {
  const queryClient = useQueryClient();
  const [unsentImages, setUnsentImages] = useState<ReadonlyMap<string, UnsentChatImage>>(() => new Map());
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null);
  const [openImage, setOpenImage] = useState<OpenChatImage | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void drawSampleImage().then((blob) => {
      if (cancelled || !blob) return;
      queryClient.setQueryData(chatKeys.attachment(SEEDED_PATH), blob);
      const file = new File([blob], 'exemplo.png', { type: 'image/png' });
      setUnsentImages(
        new Map([
          ['m9', { pending: { messageId: 'm9', storagePath: 'vitrine/nao-enviada.png', registered: true }, file }],
        ])
      );
    });

    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  return (
    <div className="flex flex-col gap-5">
      <div
        className={cn(
          'relative flex h-[640px] flex-col overflow-y-auto rounded-2xl border border-border',
          conversationBackgroundClass
        )}
      >
        <ConversationTopBar>
          <ConversationTitle teamName="Enfermagem" subject="Sintomas" subjectInfo={SAMPLE_SUBJECT.info} isOpen />
        </ConversationTopBar>
        <main className="flex flex-1 flex-col gap-5 px-4 pt-4 pb-3">
          <ChatNotice businessHours="seg–sex, 08h–18h" surface="conversation" />
          <MessageLog
            messages={SAMPLE_MESSAGES}
            teamName="Enfermagem"
            viewer={VIEWER}
            deliveryStatus="read"
            unsentImages={unsentImages}
            retryingMessageId={retryingMessageId}
            onRetryImage={(image) => {
              setRetryingMessageId(image.pending.messageId);
              window.setTimeout(() => setRetryingMessageId(null), 1500);
            }}
            onOpenImage={setOpenImage}
          />
        </main>
        <div className="sticky bottom-0 z-20">
          <ChatComposer isSendingText={false} isSendingImage={false} onSendText={() => {}} onSendImage={() => {}} />
        </div>
      </div>
      <ChatImageViewer image={openImage} onClose={() => setOpenImage(null)} />

      <div className="relative flex h-[720px] flex-col overflow-y-auto rounded-2xl border border-border">
        <ChatListLayout businessHours="seg–sex, 08h–18h">
          <SubjectGrid subjects={SAMPLE_SUBJECTS} onSelect={() => setModalOpen(true)} />
          <ConversationList conversations={SAMPLE_CONVERSATIONS} />
          <ChatNotice />
        </ChatListLayout>
      </div>

      <div className="relative flex h-[520px] flex-col overflow-y-auto rounded-2xl border border-border">
        <ChatListLayout isLoading>
          <ChatListSkeleton />
        </ChatListLayout>
      </div>

      <div className="relative flex h-[520px] flex-col overflow-y-auto rounded-2xl border border-border">
        <ChatListLayout>
          <SubjectGrid subjects={SAMPLE_SUBJECTS} onSelect={() => setModalOpen(true)} />
          <ConversationList conversations={[]} />
        </ChatListLayout>
      </div>

      <div className="relative h-[420px] overflow-hidden rounded-2xl border border-border">
        <ConversationSkeleton />
      </div>

      <Button variant="outline" onClick={() => setModalOpen(true)}>
        Abrir a nova conversa
      </Button>
      <NewConversationModal
        open={modalOpen}
        subject={SAMPLE_SUBJECT}
        initialText="Sobre o compromisso de amanhã: "
        onClose={() => setModalOpen(false)}
        onCreated={() => setModalOpen(false)}
      />
    </div>
  );
}
