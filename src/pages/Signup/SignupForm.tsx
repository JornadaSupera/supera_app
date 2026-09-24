import { Controller, type UseFormReturn } from 'react-hook-form';
import FlowScreen from '../../components/ui/flow-screen';
import Input from '../../components/ui/input';
import DateField from '../../components/ui/date-field';
import PasswordInput from '../../components/ui/password-input';
import PasswordStrengthMeter from '../../components/ui/password-strength-meter';
import Button from '../../components/ui/button';
import TermsConsent from './TermsConsent';
import type { SignupFormValues } from '../../schemas/signup';
import type { LegalDocumentKind } from '../../types';
import { formatCPF, formatPhone } from '../../utils/masks';
import { maskedRegister } from '../../utils/maskedInput';
import { todayInClinicTimeZone } from '../../utils/date';

const FORM_ID = 'signup-form';

interface SignupFormProps {
  form: UseFormReturn<SignupFormValues>;
  onSubmit: () => void;
  onBack: () => void;
  onSignIn: () => void;
  onOpenDocument: (kind: LegalDocumentKind) => void;
  isPending: boolean;
  /** Mensagem do servidor quando a conta não pôde ser criada. */
  error: string | null;
}

/**
 * Criar conta, numa tela só: os dados da pessoa, o acesso ao app e o aceite
 * dos termos. Os dois primeiros blocos têm título para a tela não virar uma
 * lista de sete campos sem começo nem fim.
 */
export default function SignupForm({
  form,
  onSubmit,
  onBack,
  onSignIn,
  onOpenDocument,
  isPending,
  error,
}: SignupFormProps) {
  const {
    register,
    watch,
    control,
    formState: { errors },
  } = form;

  // Conferência ao vivo: a diferença entre as duas senhas aparece enquanto a
  // pessoa digita a confirmação, sem esperar sair do campo.
  const password = watch('password');
  const confirmPassword = watch('confirmPassword');
  const passwordsDiffer = confirmPassword.length > 0 && confirmPassword !== password;
  const passwordsMatch = confirmPassword.length > 0 && confirmPassword === password;

  return (
    <FlowScreen
      title="Criar conta"
      subtitle="Preencha seus dados para acessar o app."
      onBack={onBack}
      footer={
        <>
          <Button type="submit" form={FORM_ID} fullWidth loading={isPending}>
            Criar conta
          </Button>
          <Button variant="ghost" fullWidth onClick={onSignIn}>
            Já tenho conta
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        noValidate
        className="flex flex-col gap-8"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <fieldset className="flex min-w-0 flex-col gap-4 border-0 p-0">
          <legend className="mb-3 text-[15px] font-semibold text-foreground">Seus dados</legend>
          <Input
            label="Nome completo"
            id="signup-name"
            autoComplete="name"
            error={errors.fullName?.message}
            {...register('fullName')}
          />
          <Input
            label="CPF"
            id="signup-cpf"
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            maxLength={14}
            error={errors.cpf?.message}
            // Corrigir um dígito no meio é o caso comum, e uma máscara que joga o
            // cursor para o fim embaralha o campo: por isso o cursor é preservado.
            {...maskedRegister(register, 'cpf', formatCPF)}
          />
          <Controller
            control={control}
            name="birthDate"
            render={({ field, fieldState }) => (
              <DateField
                ref={field.ref}
                label="Data de nascimento"
                id="signup-birth-date"
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                maxDate={todayInClinicTimeZone()}
                // Quem se cadastra é adulto: o calendário abre nos anos, já
                // perto de uma idade comum, e não em 2026 a décadas do alvo.
                startYear={new Date().getFullYear() - 50}
                pickerTitle="Data de nascimento"
              />
            )}
          />
          <Input
            label="Celular"
            id="signup-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(00) 00000-0000"
            maxLength={15}
            error={errors.phone?.message}
            {...maskedRegister(register, 'phone', formatPhone)}
          />
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-4 border-0 p-0">
          <legend className="mb-3 text-[15px] font-semibold text-foreground">Seu acesso</legend>
          <Input
            label="E-mail"
            id="signup-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <div>
            <PasswordInput
              label="Senha"
              id="signup-password"
              autoComplete="new-password"
              placeholder="Mínimo de 8 caracteres"
              error={errors.password?.message}
              {...register('password')}
            />
            <div className="mt-2">
              <PasswordStrengthMeter password={password} />
            </div>
          </div>
          <PasswordInput
            label="Confirme a senha"
            id="signup-password-confirm"
            autoComplete="new-password"
            placeholder="Repita a senha"
            error={
              errors.confirmPassword?.message ??
              (passwordsDiffer ? 'As senhas não coincidem.' : undefined)
            }
            helperText={passwordsMatch ? 'As senhas conferem.' : undefined}
            {...register('confirmPassword')}
          />
        </fieldset>

        <Controller
          control={control}
          name="acceptedTerms"
          render={({ field, fieldState }) => (
            <TermsConsent
              ref={field.ref}
              checked={field.value}
              onChange={field.onChange}
              onOpenDocument={onOpenDocument}
              error={fieldState.error?.message}
            />
          )}
        />

        {error && (
          // Uma `div` leva a margem negativa: em `<p>` ela seria anulada pelo
          // reset de `index.css` (fora de `@layer`), e o erro ficaria a 32px do aceite.
          <div className="-mt-4">
            <p role="alert" className="text-[12px]/[1.5] text-destructive">
              {error}
            </p>
          </div>
        )}
      </form>
    </FlowScreen>
  );
}
