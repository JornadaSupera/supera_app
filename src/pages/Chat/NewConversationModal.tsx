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
  assunto: ChatSubjectOption | null;
  /** Começo da primeira mensagem, para quem abre a conversa a partir de outra
   * tela (ex.: um compromisso da agenda). O paciente edita antes de enviar. */
  initialText?: string;
  onClose: () => void;
  onCriada: (novoId: string) => void;
}

export default function NewConversationModal({
  open,
  assunto,
  initialText = '',
  onClose,
  onCriada,
}: NewConversationModalProps) {
  const iniciarConversaMutation = useStartConversation();
  const { reset: resetMutation } = iniciarConversaMutation;

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
  }, [open, assunto, initialText, reset, resetMutation]);

  const body = watch('body') ?? '';

  function onSubmit({ body }: ChatMessageFormValues) {
    if (!assunto || iniciarConversaMutation.isPending) return;

    iniciarConversaMutation.mutate(
      { subjectId: assunto.id, texto: body },
      { onSuccess: (resultado) => onCriada(resultado.id) }
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={assunto ? `Nova conversa · ${assunto.label}` : 'Nova conversa'}
      titleIcon={assunto?.info?.icon}
      titleIconTone={assunto?.info?.colorVar}
      footer={
        <Button
          type="submit"
          form={FORM_ID}
          variant="primary"
          fullWidth
          iconLeft={Send}
          loading={iniciarConversaMutation.isPending}
          disabled={!body.trim() || !assunto || iniciarConversaMutation.isPending}
        >
          Enviar mensagem
        </Button>
      }
    >
      <form id={FORM_ID} className="flex flex-col gap-3" onSubmit={handleSubmit(onSubmit)} noValidate>
        <p className="text-[14px] text-muted-foreground">
          {assunto?.info ? assunto.info.descricao : 'Escreva para a equipe multidisciplinar.'}
        </p>

        {/* O horário vem do banco; sem horário configurado, o aviso não aparece. */}
        {businessHours && (
          <div className="flex items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--color-mood-1)_10%,transparent)] px-3 py-2 text-[12px] text-foreground">
            <Clock size={14} strokeWidth={2} className="shrink-0 text-[var(--color-mood-1)]" aria-hidden="true" />
            <span>
              Equipe online: <strong>{businessHours}</strong>
            </span>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <textarea
            id={BODY_ID}
            className="min-h-[110px] w-full resize-none rounded-lg border border-border bg-background p-3.5 text-[16px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            maxLength={CHAT_MESSAGE_MAX_LENGTH}
            placeholder="Escreva sua primeira mensagem para a equipe..."
            aria-label="Mensagem"
            aria-describedby={COUNT_ID}
            aria-invalid={errors.body ? true : undefined}
            {...register('body')}
          />
          {/* A mensagem é imutável: o teto aparece antes do envio, e não como erro depois. */}
          <span id={COUNT_ID} aria-live="polite" className="self-end text-[11px] text-muted-foreground">
            {body.length}/{CHAT_MESSAGE_MAX_LENGTH}
          </span>
          {errors.body && (
            <span role="alert" className="text-[12px] text-destructive">
              {errors.body.message}
            </span>
          )}
        </div>

        {iniciarConversaMutation.isError && (
          <span role="alert" className="text-[12px] text-destructive">
            {describeMutationError(
              iniciarConversaMutation.error,
              'Não foi possível iniciar a conversa.'
            )}
          </span>
        )}
      </form>
    </Modal>
  );
}
