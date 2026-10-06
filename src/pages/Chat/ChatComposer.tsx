import { useRef } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ImagePlus, SendHorizontal } from 'lucide-react';
import { Spinner } from '../../components/ui/loading';
import { useToast } from '../../contexts/ToastContext';
import {
  CHAT_MESSAGE_MAX_LENGTH,
  chatImageAttachmentSchema,
  chatMessageSchema,
  type ChatMessageFormValues,
} from '../../schemas/chat';

/**
 * O campo cresce até esta altura (5 linhas de 24 px + 2 × 12 px) e passa a
 * rolar. Anda junto com o `max-h-36` do campo.
 */
const MAX_TEXTAREA_HEIGHT = 144;

/** A contagem de caracteres aparece quando falta este tanto para o limite. */
const COUNTER_THRESHOLD = 200;

/**
 * Dispositivo de toque: Enter quebra a linha, e o envio é pelo botão (no
 * teclado do celular não existe Shift+Enter). No computador, Enter envia.
 */
function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

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
 * A barra de digitar da conversa: uma cápsula branca e opaca que flutua sobre
 * o fundo de bambus, com anexar imagem, o texto (RHF + Zod, com o teto de
 * `CHAT_MESSAGE_MAX_LENGTH`) e enviar. O texto cresce de 1 a 5 linhas. O
 * enviar segue o botão principal do app (verde da marca, seta escura); vazio,
 * fica na tinta clara do verde, como no modelo da clínica.
 */
export default function ChatComposer({
  isSendingText,
  isSendingImage,
  onSendText,
  onSendImage,
}: ChatComposerProps) {
  const { showToast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isTouch = useRef(isTouchDevice()).current;

  const { register, handleSubmit, reset, setValue, watch } = useForm<ChatMessageFormValues>({
    resolver: zodResolver(chatMessageSchema),
    defaultValues: { body: '' },
  });
  const { ref: registerRef, ...bodyField } = register('body');

  const body = watch('body');
  const canSend = body.trim().length > 0 && !isSendingText;
  const remaining = CHAT_MESSAGE_MAX_LENGTH - body.length;

  function fitHeight() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }

  function onValid({ body: text }: ChatMessageFormValues) {
    reset({ body: '' });
    requestAnimationFrame(fitHeight);
    onSendText(text, () => {
      setValue('body', text);
      requestAnimationFrame(fitHeight);
    });
  }

  function onInvalid(errors: FieldErrors<ChatMessageFormValues>) {
    showToast(errors.body?.message ?? 'Não foi possível enviar a mensagem.', { variant: 'error' });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isTouch || event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSend) formRef.current?.requestSubmit();
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
    <div className="px-4 pt-2 pb-[calc(0.75rem_+_var(--safe-bottom))]">
      {/* Canto de 30 px = os 24 do botão redondo + os 6 do respiro: a cápsula
          acompanha os botões, com uma linha ou com cinco. Com o campo em foco,
          o anel de foco do guia (laranja, 2 + 2 px) vai na cápsula, com os
          cantos dela; anexar e enviar, alcançados pelo Tab, têm o próprio. */}
      <form
        ref={formRef}
        className="flex items-end gap-1 rounded-[30px] bg-card p-1.5 shadow-[var(--shadow-float),inset_0_1px_0_var(--glass-highlight)] ring-1 ring-[var(--glass-edge)] has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-[var(--color-ring)]"
        onSubmit={handleSubmit(onValid, onInvalid)}
        noValidate
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 ease-[ease] hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSendingImage}
          aria-label="Anexar imagem"
        >
          {isSendingImage ? <Spinner size={24} /> : <ImagePlus size={24} strokeWidth={2} />}
        </button>

        <textarea
          rows={1}
          // 24 px de linha + 2 × 12 px: uma linha dá os 48 px dos botões. Sem
          // caixa visível, o campo não desenha o próprio anel de foco — quem o
          // mostra é a cápsula (o `!` vence o `:focus-visible` global, fora de
          // `@layer`).
          className="max-h-36 min-h-12 min-w-0 flex-1 resize-none bg-transparent px-1 py-3 text-body leading-[24px] text-foreground outline-none! placeholder:text-muted-foreground"
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          autoComplete="off"
          enterKeyHint={isTouch ? 'enter' : 'send'}
          placeholder="Escreva para a equipe…"
          aria-label="Mensagem"
          aria-describedby={remaining <= COUNTER_THRESHOLD ? 'chat-composer-count' : undefined}
          onKeyDown={handleKeyDown}
          onInput={fitHeight}
          {...bodyField}
          ref={(element) => {
            registerRef(element);
            textareaRef.current = element;
          }}
        />

        <button
          type="submit"
          className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground transition-[background-color,scale] duration-150 ease-[ease] active:scale-95 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-secondary-foreground motion-reduce:active:scale-100"
          disabled={!canSend}
          aria-label="Enviar mensagem"
        >
          <SendHorizontal size={24} strokeWidth={2} />
        </button>
      </form>

      {remaining <= COUNTER_THRESHOLD && (
        // `pt-1`, não `mt-1`: o reset global do `index.css` zera a margem do `p`.
        // Texto solto sobre os bambus: na tinta escura, como o "Lida pela
        // equipe" e o nome de quem escreveu.
        <p
          id="chat-composer-count"
          aria-live="polite"
          className="pt-1 pr-3 text-right text-caption font-medium text-foreground"
        >
          {body.length}/{CHAT_MESSAGE_MAX_LENGTH}
        </p>
      )}
    </div>
  );
}
