import { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MessageSquarePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import Modal from '../../components/ui/modal';
import Button from '../../components/ui/button';
import Textarea from '../../components/ui/textarea';
import {
  REQUEST_CONTEXT_MAX_CHARS,
  contentRequestSchema,
  type ContentRequestFormValues,
} from '../../schemas/contentAssistant';

const FORM_ID = 'content-request-form';

interface ContentRequestSheetProps {
  open: boolean;
  /** O rascunho da IA (`suggested_context`), que a pessoa revisa antes de enviar. */
  defaultContext: string;
  /** O pedido está indo ao banco: o botão espera e não aceita outro toque. */
  loading: boolean;
  onSubmit: (context: string) => void;
  onClose: () => void;
}

/**
 * Pedido de orientação: a IA não achou nada, e a pessoa pede que a equipe
 * escreva. O texto chega ao painel sem nome nem ficha, e quem pediu recebe um
 * aviso quando a equipe responder.
 */
export default function ContentRequestSheet({
  open,
  defaultContext,
  loading,
  onSubmit,
  onClose,
}: ContentRequestSheetProps) {
  const contextId = useId();
  const counterId = useId();
  const errorId = useId();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ContentRequestFormValues>({
    resolver: zodResolver(contentRequestSchema),
    defaultValues: { context: defaultContext },
  });

  // Cada abertura começa do rascunho daquela pergunta.
  useEffect(() => {
    if (open) reset({ context: defaultContext.slice(0, REQUEST_CONTEXT_MAX_CHARS) });
  }, [open, defaultContext, reset]);

  const context = watch('context') ?? '';

  function submit(values: ContentRequestFormValues) {
    if (loading) return;
    onSubmit(values.context);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pedir uma orientação"
      titleIcon={MessageSquarePlus}
      footer={
        <Button type="submit" form={FORM_ID} variant="primary" fullWidth loading={loading} disabled={loading}>
          Enviar pedido
        </Button>
      }
    >
      {/* Os espaços são `gap`: o reset de `index.css` zera a margem de `<p>`. */}
      <form id={FORM_ID} className="flex flex-col gap-6" onSubmit={handleSubmit(submit)} noValidate>
        <p className="text-body-sm text-muted-foreground">
          A equipe lê o pedido e a sua pergunta sem o seu nome, e avisa você quando houver uma orientação.
        </p>

        <div className="flex flex-col gap-1">
          <label htmlFor={contextId} className="text-label font-semibold text-foreground">
            Sobre o que você quer a orientação?
          </label>
          <Textarea
            id={contextId}
            className={cn('mt-1 min-h-[120px]', errors.context && 'border-destructive')}
            maxLength={REQUEST_CONTEXT_MAX_CHARS}
            aria-describedby={errors.context ? `${counterId} ${errorId}` : counterId}
            aria-invalid={errors.context ? true : undefined}
            {...register('context')}
          />
          <span id={counterId} className="self-end text-caption font-medium text-muted-foreground">
            {context.length}/{REQUEST_CONTEXT_MAX_CHARS}
          </span>
          {errors.context && (
            <span id={errorId} role="alert" className="text-caption font-medium text-destructive">
              {errors.context.message}
            </span>
          )}
        </div>
      </form>
    </Modal>
  );
}
