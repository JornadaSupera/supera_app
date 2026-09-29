import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Send, Clock } from 'lucide-react';
import Modal from '../../components/ui/modal';
import Button from '../../components/ui/button';
import { useStartConversation } from '../../hooks/useChat';
import { useBusinessHoursLabel } from '../../hooks/useClinic';
import { describeMutationError } from '../../hooks/useAuth';
import {
  CHAT_MESSAGE_MAX_LENGTH,
  chatMessageSchema,
  type ChatMessageFormValues,
} from '../../schemas/chat';
import type { ChatSubjectOption } from '../../types';

const FORM_ID = 'new-conversation-form';
const BODY_ID = 'new-conversation-body';
const COUNT_ID = 'new-conversation-count';

interface NewConversationModalProps {
  open: boolean;
  subject: ChatSubjectOption | null;
  /** Começo da primeira mensagem, para quem abre a conversa a partir de outra
   * tela (ex.: um compromisso da agenda). O paciente edita antes de enviar. */
  initialText?: string;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}

export default function NewConversationModal({
  open,
  subject,
  initialText = '',
  onClose,
  onCreated,
}: NewConversationModalProps) {
  const startConversationMutation = useStartConversation();
  const { reset: resetMutation } = startConversationMutation;

  const { data: businessHours } = useBusinessHoursLabel();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ChatMessageFormValues>({
    resolver: zodResolver(chatMessageSchema),
    defaultValues: { body: initialText },
  });

  useEffect(() => {
    if (open) {
      reset({ body: initialText });
      // Limpa o erro da tentativa anterior: reabrir o modal e já encontrar a
      // mensagem de falha de antes seria enganoso.
      resetMutation();
    }
  }, [open, subject, initialText, reset, resetMutation]);

  const body = watch('body') ?? '';

  function onSubmit({ body }: ChatMessageFormValues) {
    if (!subject || startConversationMutation.isPending) return;

    startConversationMutation.mutate(
      { subjectId: subject.id, text: body },
      { onSuccess: (result) => onCreated(result.id) }
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={subject ? `Nova conversa · ${subject.label}` : 'Nova conversa'}
      titleIcon={subject?.info?.icon}
      titleIconTone={subject?.info?.colorVar}
      footer={
        <Button
          type="submit"
          form={FORM_ID}
          variant="primary"
          fullWidth
          iconLeft={Send}
          loading={startConversationMutation.isPending}
          disabled={!body.trim() || !subject || startConversationMutation.isPending}
        >
          Enviar mensagem
        </Button>
      }
    >
      <form id={FORM_ID} className="flex flex-col gap-3" onSubmit={handleSubmit(onSubmit)} noValidate>
        <p className="text-[14px] text-muted-foreground">
          {subject?.info ? subject.info.description : 'Escreva para a equipe multidisciplinar.'}
        </p>

        {/* O horário vem do banco; sem horário configurado, o aviso não aparece. */}
        {businessHours && (
          <div className="flex items-center gap-2 rounded-xl bg-[color-mix(in_srgb,var(--color-supera-seguranca)_8%,transparent)] px-3 py-2.5 text-[13px] text-foreground">
            <Clock
              size={15}
              strokeWidth={2}
              className="shrink-0 text-[var(--color-supera-seguranca)]"
              aria-hidden="true"
            />
            <span>
              Equipe online: <strong className="font-semibold">{businessHours}</strong>
            </span>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <textarea
            id={BODY_ID}
            className="min-h-[120px] w-full resize-none rounded-xl border border-border bg-background p-3.5 text-[16px] leading-[1.45] text-foreground transition-[border-color,box-shadow] duration-150 ease-[ease] placeholder:text-muted-foreground focus:border-ring focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-ring)_20%,transparent)] focus:outline-none"
            maxLength={CHAT_MESSAGE_MAX_LENGTH}
            placeholder="Escreva sua primeira mensagem para a equipe..."
            aria-label="Mensagem"
            aria-describedby={COUNT_ID}
            aria-invalid={errors.body ? true : undefined}
            {...register('body')}
          />
          {/* A mensagem é imutável: o teto aparece antes do envio, e não como erro depois. */}
          <span id={COUNT_ID} aria-live="polite" className="self-end text-[12px] text-muted-foreground">
            {body.length}/{CHAT_MESSAGE_MAX_LENGTH}
          </span>
          {errors.body && (
            <span role="alert" className="text-[12px] text-destructive">
              {errors.body.message}
            </span>
          )}
        </div>

        {startConversationMutation.isError && (
          <span role="alert" className="text-[12px] text-destructive">
            {describeMutationError(startConversationMutation.error, 'Não foi possível iniciar a conversa.')}
          </span>
        )}
      </form>
    </Modal>
  );
}
