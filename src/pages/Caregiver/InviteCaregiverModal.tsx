import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, TriangleAlert } from 'lucide-react';
import Modal from '../../components/ui/modal';
import Input from '../../components/ui/input';
import Tag from '../../components/ui/tag';
import Button from '../../components/ui/button';
import { formatPhone } from '../../utils/masks';
import { inviteCaregiverSchema } from '../../schemas/caregiver';
import type { InviteCaregiverFormValues } from '../../schemas/caregiver';
import { useInviteCaregiver } from '../../hooks/useCaregiver';
import { describeMutationError } from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';

const FORM_ID = 'invite-caregiver-form';

interface InviteCaregiverModalProps {
  open: boolean;
  onClose: () => void;
}

export default function InviteCaregiverModal({ open, onClose }: InviteCaregiverModalProps) {
  const { showToast } = useToast();
  const inviteMutation = useInviteCaregiver();
  const { reset: resetMutation } = inviteMutation;

  const [copiado, setCopiado] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isValid },
  } = useForm<InviteCaregiverFormValues>({
    resolver: zodResolver(inviteCaregiverSchema),
    mode: 'onChange',
    defaultValues: { canal: 'sms', destino: '' },
  });

  const canalAtual = watch('canal');

  useEffect(() => {
    // Roda na abertura E no fechamento de propósito: o token sai da memória
    // assim que o modal deixa a tela, em vez de ficar no estado da mutation
    // esperando a próxima abertura. Ele vale para sempre — o convite não
    // expira — então quanto menos tempo existir, melhor.
    resetMutation();
    setCopiado(false);

    if (open) {
      reset({ canal: 'sms', destino: '' });
    }
  }, [open, reset, resetMutation]);

  const convite = inviteMutation.data;

  function handleTrocarCanal(canal: 'sms' | 'email') {
    setValue('canal', canal, { shouldValidate: true });
    setValue('destino', '', { shouldValidate: false });
  }

  async function handleCopiar() {
    if (!convite) return;

    try {
      await navigator.clipboard.writeText(convite.token);
      setCopiado(true);
    } catch {
      // Área de transferência bloqueada (contexto inseguro, permissão negada).
      // O código continua visível na tela para cópia manual.
      showToast('Não foi possível copiar. Selecione e copie o código manualmente.', {
        variant: 'error',
      });
    }
  }

  // Passo 2: o código existe. O formulário sai de cena — reenviar criaria um
  // segundo convite, e o banco só admite um pendente por paciente.
  if (convite) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Convite criado"
        titleIcon={undefined}
        footer={
          <Button variant="primary" fullWidth onClick={onClose}>
            Já entreguei o código
          </Button>
        }
      >
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_6%,transparent)] p-3">
          <TriangleAlert
            size={16}
            strokeWidth={2}
            className="mt-[1px] shrink-0 text-destructive"
            aria-hidden="true"
          />
          <p className="text-[12px]/[1.5] text-foreground">
            Este código aparece <strong>uma única vez</strong>. Copie e envie agora para a pessoa
            que você quer vincular — não há como vê-lo de novo.
          </p>
        </div>

        <p className="mb-2 text-[13px]/[1.5] text-muted-foreground">
          Na tela de login do aplicativo, ela toca em{' '}
          <strong>&ldquo;Recebeu um convite? Aceitar convite&rdquo;</strong>, cria um login próprio
          e informa este código para concluir o vínculo.
        </p>

        <div className="rounded-lg border border-border bg-[color-mix(in_srgb,var(--color-muted)_30%,transparent)] p-3">
          <p className="font-mono text-[12px]/[1.6] break-all text-foreground" translate="no">
            {convite.token}
          </p>
        </div>

        <Button
          variant="outline"
          fullWidth
          iconLeft={Copy}
          className="mt-3"
          onClick={() => void handleCopiar()}
        >
          {copiado ? 'Código copiado' : 'Copiar código'}
        </Button>

        <p className="mt-3 text-[11px]/[1.5] text-muted-foreground">
          Enquanto o convite não for aceito, você pode cancelá-lo a qualquer momento — e isso
          invalida o código.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Convidar acompanhante"
      titleIcon={undefined}
      footer={
        <Button
          type="submit"
          form={FORM_ID}
          fullWidth
          loading={inviteMutation.isPending}
          disabled={!isValid || inviteMutation.isPending}
        >
          Criar convite
        </Button>
      }
    >
      <p className="mb-4 text-[14px]/[1.5] text-muted-foreground">
        Ele(a) vai criar um login próprio — nunca vai usar a sua senha. Você recebe um código para
        entregar à pessoa.
      </p>

      <form
        id={FORM_ID}
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((valores) => inviteMutation.mutate(valores))}
      >
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-foreground">Como você vai avisar</span>
          <div className="flex gap-2">
            <Tag
              className="min-h-11 min-w-11 px-4 py-2"
              selected={canalAtual === 'sms'}
              onClick={() => handleTrocarCanal('sms')}
            >
              SMS
            </Tag>
            <Tag
              className="min-h-11 min-w-11 px-4 py-2"
              selected={canalAtual === 'email'}
              onClick={() => handleTrocarCanal('email')}
            >
              E-mail
            </Tag>
          </div>
        </div>

        {canalAtual === 'sms' ? (
          <Input
            label="Celular do acompanhante"
            id="cuidador-destino"
            type="tel"
            inputMode="tel"
            placeholder="(00) 00000-0000"
            required
            error={errors.destino?.message}
            {...register('destino', {
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                setValue('destino', formatPhone(event.target.value), { shouldValidate: true });
              },
            })}
          />
        ) : (
          <Input
            label="E-mail do acompanhante"
            id="cuidador-destino"
            type="email"
            inputMode="email"
            required
            error={errors.destino?.message}
            {...register('destino')}
          />
        )}
      </form>

      {inviteMutation.isError && (
        <p role="alert" className="mt-3 text-[12px] text-destructive">
          {describeMutationError(inviteMutation.error, 'Não foi possível criar o convite.')}
        </p>
      )}
    </Modal>
  );
}
