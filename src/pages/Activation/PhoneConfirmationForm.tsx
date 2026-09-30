import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import FlowScreen from '../../components/ui/flow-screen';
import Input from '../../components/ui/input';
import DateField from '../../components/ui/date-field';
import Button from '../../components/ui/button';
import { phoneConfirmationSchema, type PhoneConfirmationFormValues } from '../../schemas/signup';
import { formatCPF, formatPhone } from '../../utils/masks';
import { maskedRegister } from '../../utils/maskedInput';
import { todayInClinicTimeZone } from '../../utils/date';

const FORM_ID = 'phone-confirmation-form';

const EMPTY_VALUES: PhoneConfirmationFormValues = { cpf: '', birthDate: '', phone: '' };

export interface PhoneConfirmationFormProps {
  /** O que a pessoa já tinha digitado, ao voltar da tela do código para corrigir. */
  defaultValues?: PhoneConfirmationFormValues;
  onSubmit: (values: PhoneConfirmationFormValues) => void;
  onBack: () => void;
  /** A outra saída, sob o botão principal (ex.: "Sair desta conta"). */
  secondary: { label: string; onClick: () => void; loading?: boolean };
  /** Ligando direto (o celular já estava confirmado). */
  isPending?: boolean;
  /** A recusa da ligação direta, para a pessoa corrigir os dados aqui mesmo. */
  error?: string | null;
}

/**
 * Confirmar o cadastro pelo celular, para quem já tem conta e ainda não tem
 * ficha ligada: entrou pelo Google/Apple, ou criou a conta e saiu antes do SMS.
 * Pede o que o cadastro pediria — CPF, nascimento e celular —, e a tela
 * seguinte manda o código.
 *
 * Os três ficam só em memória. Quem confere se batem com a ficha é o banco.
 *
 * É também onde se corrige CPF ou nascimento: com o celular já confirmado, a
 * ligação é direta, e a recusa aparece aqui mesmo.
 */
export default function PhoneConfirmationForm({
  defaultValues,
  onSubmit,
  onBack,
  secondary,
  isPending = false,
  error = null,
}: PhoneConfirmationFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<PhoneConfirmationFormValues>({
    resolver: zodResolver(phoneConfirmationSchema),
    mode: 'onTouched',
    defaultValues: defaultValues ?? EMPTY_VALUES,
  });

  return (
    <FlowScreen
      title="Confirme seu cadastro"
      subtitle="Informe seus dados. Se o celular ainda não foi confirmado, enviamos um código por SMS."
      onBack={onBack}
      footer={
        <>
          <Button type="submit" form={FORM_ID} fullWidth loading={isPending}>
            Continuar
          </Button>
          <Button variant="ghost" fullWidth loading={secondary.loading} onClick={secondary.onClick}>
            {secondary.label}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} noValidate className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
        <Input
          label="CPF"
          id="confirmation-cpf"
          inputMode="numeric"
          autoComplete="off"
          placeholder="000.000.000-00"
          maxLength={14}
          error={errors.cpf?.message}
          {...maskedRegister(register, 'cpf', formatCPF)}
        />
        <Controller
          control={control}
          name="birthDate"
          render={({ field, fieldState }) => (
            <DateField
              ref={field.ref}
              label="Data de nascimento"
              id="confirmation-birth-date"
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              maxDate={todayInClinicTimeZone()}
              startYear={new Date().getFullYear() - 50}
              pickerTitle="Data de nascimento"
            />
          )}
        />
        <Input
          label="Celular"
          id="confirmation-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="(00) 00000-0000"
          maxLength={15}
          error={errors.phone?.message}
          {...maskedRegister(register, 'phone', formatPhone)}
        />

        {error && (
          <div>
            <p role="alert" className="text-[12px]/[1.5] text-destructive">
              {error}
            </p>
          </div>
        )}
      </form>
    </FlowScreen>
  );
}
