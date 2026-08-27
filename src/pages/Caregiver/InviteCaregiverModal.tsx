import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import Modal from '../../components/ui/modal';
import Input from '../../components/ui/input';
import Tag from '../../components/ui/tag';
import Button from '../../components/ui/button';
import { formatPhone } from '../../utils/masks';
import { convidarCuidador } from '../../services/mockApi';

const inviteCaregiverSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do cuidador.'),
  parentesco: z.string().trim().optional(),
  meio: z.enum(['sms', 'email'], 'Selecione o meio de envio.'),
  contato: z.string().trim().min(1, 'Informe o contato do cuidador.'),
});

type InviteCaregiverFormValues = z.infer<typeof inviteCaregiverSchema>;

const FORM_ID = 'invite-caregiver-form';

interface InviteCaregiverModalProps {
  open: boolean;
  onClose: () => void;
  onSucesso: () => void;
}

export default function InviteCaregiverModal({ open, onClose, onSucesso }: InviteCaregiverModalProps) {
  const queryClient = useQueryClient();

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
    defaultValues: { nome: '', parentesco: '', meio: 'sms', contato: '' },
  });

  const meioAtual = watch('meio');

  useEffect(() => {
    if (open) {
      reset({ nome: '', parentesco: '', meio: 'sms', contato: '' });
    }
  }, [open, reset]);

  const inviteMutation = useMutation({
    mutationFn: convidarCuidador,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caregiver'] });
      onSucesso();
    },
  });

  const onSubmit = (data: InviteCaregiverFormValues) => {
    inviteMutation.mutate({
      nome: data.nome,
      parentesco: data.parentesco || 'Cuidador',
      meio: data.meio,
      contato: data.contato,
    });
  };

  function handleTrocarMeio(meio: 'sms' | 'email') {
    setValue('meio', meio, { shouldValidate: true });
    setValue('contato', '', { shouldValidate: true });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Convidar cuidador"
      // `Modal` ainda é `.jsx` sem tipos próprios — `titleIcon` não tem valor
      // padrão na desestruturação, então o TypeScript o infere como
      // obrigatório (mesmo sendo opcional em tempo de execução). Repassado
      // como `undefined` só para satisfazer o tipo inferido; some quando
      // `Modal` migrar para TS.
      titleIcon={undefined}
      footer={
        <Button
          type="submit"
          form={FORM_ID}
          fullWidth
          loading={inviteMutation.isPending}
          disabled={!isValid || inviteMutation.isPending}
        >
          Enviar convite
        </Button>
      }
    >
      <p className="mb-4 text-[14px]/[1.5] text-muted-foreground">
        Ele(a) vai receber um convite e criar um login próprio — nunca vai usar a sua senha.
      </p>

      <form id={FORM_ID} className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
        <Input
          label="Nome do cuidador"
          id="cuidador-nome"
          placeholder="Ex: Camila Mendes"
          required
          error={errors.nome?.message}
          {...register('nome')}
        />

        <Input
          label="Parentesco"
          id="cuidador-parentesco"
          placeholder="Ex: Esposa, Filho, Irmã..."
          error={errors.parentesco?.message}
          {...register('parentesco')}
        />

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-foreground">Como enviar o convite</span>
          <div className="flex gap-2">
            <Tag
              className="min-h-11 min-w-11 px-4 py-2"
              selected={meioAtual === 'sms'}
              onClick={() => handleTrocarMeio('sms')}
            >
              SMS
            </Tag>
            <Tag
              className="min-h-11 min-w-11 px-4 py-2"
              selected={meioAtual === 'email'}
              onClick={() => handleTrocarMeio('email')}
            >
              E-mail
            </Tag>
          </div>
        </div>

        {meioAtual === 'sms' ? (
          <Input
            label="Celular do cuidador"
            id="cuidador-contato"
            type="tel"
            inputMode="tel"
            placeholder="(00) 00000-0000"
            required
            error={errors.contato?.message}
            {...register('contato', {
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                setValue('contato', formatPhone(event.target.value), { shouldValidate: true });
              },
            })}
          />
        ) : (
          <Input
            label="E-mail do cuidador"
            id="cuidador-contato"
            type="email"
            inputMode="email"
            placeholder="nome@email.com"
            required
            error={errors.contato?.message}
            {...register('contato')}
          />
        )}
      </form>
    </Modal>
  );
}
