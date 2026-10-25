import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import FlowScreen from '../../components/ui/flow-screen';
import Input from '../../components/ui/input';
import InlineError from '../../components/ui/inline-error';
import DateField from '../../components/ui/date-field';
import Button from '../../components/ui/button';
import {
  isUnderage,
  phoneConfirmationSchema,
  UNDERAGE_MESSAGE,
  type PhoneConfirmationFormValues,
} from '../../schemas/signup';
import { formatCPF, formatPhone } from '../../utils/masks';
import { maskedRegister } from '../../utils/maskedInput';
import { useSoftKeyboard } from '../../hooks/useSoftKeyboard';

const FORM_ID = 'phone-confirmation-form';

const EMPTY_VALUES: PhoneConfirmationFormValues = { cpf: '', birthDate: '', phone: '' };

export interface PhoneConfirmationFormProps {
  /** O que a pessoa já tinha digitado, ao voltar da tela do código para corrigir. */
  defaultValues?: PhoneConfirmationFormValues;
  onSubmit: (values: PhoneConfirmationFormValues) => void;
  onBack: () => void;
  /** A outra saída, sob o botão principal (ex.: "Sair desta conta"). */
  secondary: { label: string; onClick: () => void; loading?: boolean };
  /** Conferindo a ficha, ou ligando direto (o celular já estava confirmado). */
  isPending?: boolean;
  /** Por que não seguiu (sem ficha, falha da conferência, recusa da ligação), para corrigir aqui mesmo. */
  error?: string | null;
}

/**
 * Os dados que ligam a conta à ficha da clínica, para quem tem conta e ainda
 * não tem ficha ligada: entrou pelo Google/Apple, criou a conta e saiu antes
 * do SMS, ou digitou algo que não conferiu. Pede CPF, nascimento e celular —
 * o mínimo que o banco usa para achar a ficha (guia 5.12).
 *
 * O texto não diz que a pessoa já tem cadastro (25/10): uma conta do Google é
 * só uma conta, e quem diz se há ficha é a conferência do banco, depois destes
 * três dados e antes de qualquer SMS.
 *
 * Os três ficam só em memória. É também onde se corrige CPF ou nascimento: com
 * o celular já confirmado, a ligação é direta, e a recusa aparece aqui mesmo.
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
    watch,
    formState: { errors },
  } = useForm<PhoneConfirmationFormValues>({
    resolver: zodResolver(phoneConfirmationSchema),
    mode: 'onTouched',
    defaultValues: defaultValues ?? EMPTY_VALUES,
  });

  // Idade conferida ao vivo, como no cadastro: com a data completa, quem tem
  // menos de 18 anos já vê o aviso em vermelho, e o "Continuar" trava.
  const underage = isUnderage(watch('birthDate'));

  // Com o teclado aberto a tela reage: a capa recolhe o título, o campo em
  // foco vai para o meio do que sobra e o rodapé fica só com o "Continuar".
  const keyboardOpen = useSoftKeyboard();

  return (
    <FlowScreen
      tone="brand"
      title="Seus dados na Supera"
      subtitle="Se encontrarmos sua ficha, enviamos um código por SMS."
      // Capa baixa: o topo não empurra os três campos para baixo do rodapé.
      compact
      collapsed={keyboardOpen}
      onBack={onBack}
      footer={
        <>
          <Button
            type="submit"
            form={FORM_ID}
            variant="brand"
            size="xl"
            fullWidth
            loading={isPending}
            disabled={underage}
          >
            Continuar
          </Button>
          {!keyboardOpen && (
            <Button variant="ghost" fullWidth loading={secondary.loading} onClick={secondary.onClick}>
              {secondary.label}
            </Button>
          )}
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
              // Digitada, sem calendário, como no cadastro (24/10).
              error={fieldState.error?.message ?? (underage ? UNDERAGE_MESSAGE : undefined)}
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

        {error && <InlineError title={error} description="" />}
      </form>
    </FlowScreen>
  );
}
