import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Paperclip, Send } from 'lucide-react';
import StickyFooter from '../../components/ui/sticky-footer';
import { Spinner } from '../../components/ui/loading';
import { useToast } from '../../contexts/ToastContext';
import {
  CHAT_MESSAGE_MAX_LENGTH,
  chatImageAttachmentSchema,
  chatMessageSchema,
  type ChatMessageFormValues,
} from '../../schemas/chat';

interface ChatComposerProps {
  isSendingText: boolean;
  isSendingImage: boolean;
  /**
   * Envia o texto. O campo já foi limpo quando isto roda; `restore` o devolve
   * se o envio falhar — perder a mensagem digitada porque a conversa foi
   * encerrada seria o pior desfecho possível aqui.
   */
  onSendText: (text: string, restore: () => void) => void;
  /** Recebe a imagem já validada (tipo e tamanho do bucket). */
  onSendImage: (file: File) => void;
}

/**
 * Campo de mensagem da conversa aberta: texto (RHF + Zod, com o teto de
 * `CHAT_MESSAGE_MAX_LENGTH`) e o botão de anexar imagem.
 *
 * O Enter envia pelo próprio formulário. Com o botão de enviar desabilitado
 * (campo vazio ou envio em curso), o navegador não submete — não há mensagem
 * de erro para um Enter sem texto.
 */
export default function ChatComposer({
  isSendingText,
  isSendingImage,
  onSendText,
  onSendImage,
}: ChatComposerProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, setValue, watch } = useForm<ChatMessageFormValues>({
    resolver: zodResolver(chatMessageSchema),
    defaultValues: { body: '' },
  });

  const body = watch('body');
  const canSend = body.trim().length > 0 && !isSendingText;

  function onValid({ body: text }: ChatMessageFormValues) {
    reset({ body: '' });
    onSendText(text, () => setValue('body', text));
  }

  function onInvalid(errors: FieldErrors<ChatMessageFormValues>) {
    showToast(errors.body?.message ?? 'Não foi possível enviar a mensagem.', { variant: 'error' });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Sempre limpa o valor do input: sem isso, escolher o MESMO arquivo de
    // novo depois de um erro não dispara `onChange` (o navegador só avisa
    // quando o valor muda), e o botão pareceria travado.
    event.target.value = '';

    if (!file) return;

    const validation = chatImageAttachmentSchema.safeParse(file);
    if (!validation.success) {
      showToast(validation.error.issues[0]?.message ?? 'Não foi possível enviar essa imagem.', {
        variant: 'error',
      });
      return;
    }

    onSendImage(file);
  }

  return (
    <StickyFooter density="compact" className="z-10 shrink-0">
      <form className="flex items-center gap-2" onSubmit={handleSubmit(onValid, onInvalid)} noValidate>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors duration-150 ease-[ease] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSendingImage}
          aria-label="Anexar imagem"
        >
          {isSendingImage ? <Spinner size="sm" /> : <Paperclip size={18} strokeWidth={2} />}
        </button>

        <input
          type="text"
          className="h-11 min-w-0 flex-1 rounded-full border border-border bg-[color-mix(in_srgb,var(--color-muted)_30%,transparent)] px-4 text-[16px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          autoComplete="off"
          placeholder="Digite sua mensagem..."
          aria-label="Mensagem"
          {...register('body')}
        />

        <button
          type="submit"
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-primary text-primary-foreground transition-colors duration-150 ease-[ease] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          disabled={!canSend}
          aria-label="Enviar mensagem"
        >
          <Send size={18} strokeWidth={2} />
        </button>
      </form>
    </StickyFooter>
  );
}
