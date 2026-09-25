import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate } from 'react-router';
import { Lock } from 'lucide-react';
import FlowScreen from '../../components/ui/flow-screen';
import Input from '../../components/ui/input';
import Button from '../../components/ui/button';
import ErrorState from '../../components/ui/error-state';
import Loading from '../../components/ui/loading';
import { describeMutationError } from '../../hooks/useAuth';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import { useMyCaregiver, useUpdateCaregiver } from '../../hooks/useCaregiver';
import { useToast } from '../../contexts/ToastContext';
import { caregiverEditSchema, type CaregiverEditFormValues } from '../../schemas/caregiver';
import { maskEmail } from '../../utils/contact';
import { formatPhone } from '../../utils/masks';
import { maskedRegister } from '../../utils/maskedInput';
import { fromInternationalPhone, toInternationalPhone } from '../../utils/phone';
import type { MyCaregiver } from '../../types';

const FORM_ID = 'caregiver-edit-form';
const CAREGIVER_PATH = '/perfil/acompanhante';

function EditForm({ caregiver }: { caregiver: MyCaregiver }) {
  const goBack = useGoBackOr(CAREGIVER_PATH);
  const { showToast } = useToast();
  const update = useUpdateCaregiver();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CaregiverEditFormValues>({
    resolver: zodResolver(caregiverEditSchema),
    mode: 'onTouched',
    defaultValues: {
      fullName: caregiver.fullName,
      phone: formatPhone(fromInternationalPhone(caregiver.phone)),
    },
  });

  const submit = handleSubmit((values) => {
    update.mutate(
      { fullName: values.fullName.trim(), phone: toInternationalPhone(values.phone) },
      {
        onSuccess: () => {
          showToast('Dados do acompanhante atualizados.', { variant: 'success' });
          goBack();
        },
      }
    );
  });

  return (
    <FlowScreen
      title="Editar acompanhante"
      subtitle="Você pode corrigir o nome e o telefone. O e-mail não muda."
      onBack={goBack}
      footer={
        <>
          {update.isError && (
            <p role="alert" className="text-center text-[12px] text-destructive">
              {describeMutationError(update.error, 'Não foi possível salvar. Tente novamente.')}
            </p>
          )}
          <Button type="submit" form={FORM_ID} fullWidth loading={update.isPending}>
            Salvar alterações
          </Button>
          <Button variant="ghost" fullWidth onClick={goBack}>
            Cancelar
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Input
          label="Nome completo"
          id="caregiver-edit-name"
          autoComplete="off"
          error={errors.fullName?.message}
          {...register('fullName')}
        />
        <Input
          label="Celular"
          id="caregiver-edit-phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          error={errors.phone?.message}
          {...maskedRegister(register, 'phone', formatPhone)}
        />
        <Input
          label="E-mail"
          id="caregiver-edit-email"
          iconLeft={Lock}
          value={maskEmail(caregiver.email)}
          readOnly
          disabled
          helperText="O e-mail é o login do acompanhante e não pode ser alterado."
        />
      </form>
    </FlowScreen>
  );
}

/** Editar nome e telefone do acompanhante ativo. */
export default function CaregiverEdit() {
  const goBack = useGoBackOr(CAREGIVER_PATH);
  const query = useMyCaregiver();

  if (query.isPending) return <Loading />;

  // Só cai no erro quando não há dado: uma releitura que falha (voltar de outro
  // app com a rede ruim) mantém o `data`, e trocar o formulário pelo erro
  // apagaria o que a pessoa já digitou.
  if (query.isError && query.data === undefined) {
    return (
      <FlowScreen title="Editar acompanhante" onBack={goBack}>
        <ErrorState
          className="min-h-0 py-10"
          title="Não foi possível carregar seu acompanhante"
          onRetry={() => void query.refetch()}
        />
      </FlowScreen>
    );
  }

  // Sem acompanhante ativo não há o que editar.
  if (!query.data) return <Navigate to={CAREGIVER_PATH} replace />;

  return <EditForm caregiver={query.data} />;
}
