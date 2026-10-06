import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Send, Clock } from 'lucide-react';
import Modal from '../../components/ui/modal';
import Button from '../../components/ui/button';
import Textarea from '../../components/ui/textarea';
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
        <p className="text-body-sm text-muted-foreground">
          {subject?.info ? subject.info.description : 'Escreva para a equipe multidisciplinar.'}
        </p>

        {/* O horário vem do banco; sem horário configurado, o aviso não aparece.
            Caixa informativa do guia: a tinta `surface-teal` (`secondary`) e o
            canto de 20 px. O ícone de 24 px fica centrado na primeira linha,
            de 21 px (`-my-[1.5px]`). */}
        {businessHours && (
          <div className="flex items-start gap-3 rounded-2xl bg-secondary px-4 py-3 text-body-sm text-foreground">
            <Clock size={24} strokeWidth={2} className="-my-[1.5px] shrink-0 text-primary-deep" aria-hidden="true" />
            <span>
              Equipe online: <strong className="font-semibold">{businessHours}</strong>
            </span>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <Textarea
            id={BODY_ID}
            className="min-h-[120px]"
            maxLength={CHAT_MESSAGE_MAX_LENGTH}
            placeholder="Escreva sua primeira mensagem para a equipe..."
            aria-label="Mensagem"
            aria-describedby={COUNT_ID}
            aria-invalid={errors.body ? true : undefined}
            {...register('body')}
          />
          {/* A mensagem é imutável: o teto aparece antes do envio, e não como erro depois. */}
          <span
            id={COUNT_ID}
            aria-live="polite"
            className="self-end text-caption font-medium text-muted-foreground"
          >
            {body.length}/{CHAT_MESSAGE_MAX_LENGTH}
          </span>
          {errors.body && (
            <span role="alert" className="text-caption font-medium text-destructive">
              {errors.body.message}
            </span>
          )}
        </div>

        {startConversationMutation.isError && (
          <span role="alert" className="text-caption font-medium text-destructive">
            {describeMutationError(startConversationMutation.error, 'Não foi possível iniciar a conversa.')}
          </span>
        )}
      </form>
    </Modal>
  );
}
