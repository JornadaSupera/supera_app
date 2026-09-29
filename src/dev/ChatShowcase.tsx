import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Button from '../components/ui/button';
import { chatKeys } from '../hooks/useChat';
import ChatComposer from '../pages/Chat/ChatComposer';
import { ChatListSkeleton } from '../pages/Chat/ChatSkeletons';
import { MessageImage, UnsentImage } from '../pages/Chat/MessageImage';
import NewConversationModal from '../pages/Chat/NewConversationModal';
import { getAssuntoInfo } from '../utils/chat';
import type { ChatSubjectOption } from '../types';

/** Assunto de exemplo — o id é fictício, e a vitrine nunca envia a conversa. */
const SAMPLE_SUBJECT: ChatSubjectOption = {
  id: 'vitrine',
  code: 'symptoms',
  label: 'Sintomas',
  info: getAssuntoInfo('symptoms'),
};

// Peças do Chat na vitrine. A conversa real vive atrás do login; aqui dá
// para conferir o acabamento da imagem baixada, da imagem que não subiu, do
// campo de mensagem e do carregamento sem sessão de teste.

/** Caminho fictício: o cache é semeado com a imagem gerada, e nada vai ao bucket. */
const SEEDED_PATH = 'vitrine/exemplo.png';

/** Caminho que não existe: sem sessão, o download falha e a bolha mostra o aviso. */
const MISSING_PATH = 'vitrine/indisponivel.png';

/** Desenha uma imagem de exemplo no canvas — nenhum arquivo de paciente. */
function drawSampleImage(): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 300;
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);

  // As cores saem dos tokens do tema, como no resto do app.
  const styles = getComputedStyle(document.documentElement);
  context.fillStyle = styles.getPropertyValue('--color-primary').trim();
  context.fillRect(0, 0, 400, 300);
  context.fillStyle = styles.getPropertyValue('--color-primary-foreground').trim();
  context.font = '600 36px sans-serif';
  context.fillText('Exemplo', 130, 165);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export default function ChatShowcase() {
  const queryClient = useQueryClient();
  const [sample, setSample] = useState<File | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void drawSampleImage().then((blob) => {
      if (cancelled || !blob) return;
      queryClient.setQueryData(chatKeys.attachment(SEEDED_PATH), blob);
      setSample(new File([blob], 'exemplo.png', { type: 'image/png' }));
    });

    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-end gap-3 rounded-2xl border border-border p-4">
        {sample && <MessageImage storagePath={SEEDED_PATH} alt="Imagem de exemplo" side="own" />}
        {sample && (
          <UnsentImage
            file={sample}
            retrying={retrying}
            onRetry={() => {
              setRetrying(true);
              window.setTimeout(() => setRetrying(false), 1500);
            }}
          />
        )}
        <div className="self-start">
          <MessageImage storagePath={MISSING_PATH} alt="Imagem indisponível" side="team" />
        </div>
      </div>

      <div className="relative flex h-[200px] flex-col justify-end overflow-auto rounded-2xl border border-border">
        <ChatComposer
          isSendingText={false}
          isSendingImage={false}
          onSendText={() => {}}
          onSendImage={() => {}}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border">
        <ChatListSkeleton />
      </div>

      <Button variant="outline" onClick={() => setModalOpen(true)}>
        Abrir a nova conversa
      </Button>
      <NewConversationModal
        open={modalOpen}
        assunto={SAMPLE_SUBJECT}
        initialText="Sobre o compromisso de amanhã: "
        onClose={() => setModalOpen(false)}
        onCriada={() => setModalOpen(false)}
      />
    </div>
  );
}
