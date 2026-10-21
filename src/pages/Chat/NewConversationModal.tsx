import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MessageCircle, Clock } from 'lucide-react';
import Modal from '../../components/ui/modal';
import Button from '../../components/ui/button';
import Textarea from '../../components/ui/textarea';
import { useBusinessHoursLabel } from '../../hooks/useClinic';
import { useNursingWhatsApp } from '../../hooks/useNursingWhatsApp';
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
  /** Começo da dúvida, para quem chega de outra tela (ex.: um compromisso da
   * agenda). O paciente edita antes de enviar. */
  initialText?: string;
  onClose: () => void;
}

/**
 * "Falar com a enfermagem" (desde 21/10): a pessoa escreve a dúvida no app e o
 * WhatsApp da enfermagem abre com a mensagem pronta — quem é o paciente, o
 * diagnóstico, o assunto e a dúvida (ver `buildNursingMessage`). A clínica atende por lá; o
 * chat do app não recebe conversa nova.
 */
export default function NewConversationModal({
  open,
  subject,
  initialText = '',
  onClose,
}: NewConversationModalProps) {
  const nursing = useNursingWhatsApp();

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
    if (open) reset({ body: initialText });
  }, [open, subject, initialText, reset]);

  const body = watch('body') ?? '';

  function onSubmit({ body }: ChatMessageFormValues) {
    if (!subject || nursing.isPending) return;

    // Abriu o WhatsApp: a conversa segue lá, e o modal fecha.
    nursing.send(subject.label, body, { onSuccess: onClose });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={subject ? `Falar com a enfermagem · ${subject.label}` : 'Falar com a enfermagem'}
      titleIcon={subject?.info?.icon}
      footer={
        <Button
          type="submit"
          form={FORM_ID}
          variant="primary"
          fullWidth
          iconLeft={MessageCircle}
          loading={nursing.isPending}
          disabled={!body.trim() || !subject || !nursing.ready || nursing.isPending}
        >
          Abrir no WhatsApp
        </Button>
      }
    >
      <form id={FORM_ID} className="flex flex-col gap-3" onSubmit={handleSubmit(onSubmit)} noValidate>
        <p className="text-body-sm text-muted-foreground">
          Escreva a sua dúvida. O WhatsApp da enfermagem abre com a mensagem pronta, já com o seu nome e o
          assunto: é só tocar em enviar.
        </p>

        {/* O horário vem do banco; sem horário configurado, o aviso não aparece.
            Caixa informativa do guia: a tinta `surface-teal` (`secondary`) e o
            canto de 20 px. O ícone de 24 px fica centrado na primeira linha,
            de 21 px (`-my-[1.5px]`). */}
        {businessHours && (
          <div className="flex items-start gap-3 rounded-2xl bg-secondary px-4 py-3 text-body-sm text-foreground">
            <Clock size={24} strokeWidth={2} className="-my-[1.5px] shrink-0 text-primary-deep" aria-hidden="true" />
            <span>
              Enfermagem online: <strong className="font-semibold">{businessHours}</strong>
            </span>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <Textarea
            id={BODY_ID}
            className="min-h-[120px]"
            maxLength={CHAT_MESSAGE_MAX_LENGTH}
            placeholder="Qual é a sua dúvida?"
            aria-label="Sua dúvida"
            aria-describedby={COUNT_ID}
            aria-invalid={errors.body ? true : undefined}
            {...register('body')}
          />
          {/* O teto aparece antes do envio, e não como erro depois. */}
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
      </form>
    </Modal>
  );
}
