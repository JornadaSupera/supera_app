import { Controller, type UseFormReturn } from 'react-hook-form';
import FlowScreen from '../../components/ui/flow-screen';
import Input from '../../components/ui/input';
import InlineError from '../../components/ui/inline-error';
import DateField from '../../components/ui/date-field';
import PasswordInput from '../../components/ui/password-input';
import PasswordStrengthMeter from '../../components/ui/password-strength-meter';
import Button from '../../components/ui/button';
import TermsConsent from './TermsConsent';
import { isUnderage, UNDERAGE_MESSAGE, type SignupFormValues } from '../../schemas/signup';
import type { LegalDocumentKind } from '../../types';
import { formatCPF, formatPhone } from '../../utils/masks';
import { maskedRegister } from '../../utils/maskedInput';
import { useSoftKeyboard } from '../../hooks/useSoftKeyboard';

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
 * lista de campos sem começo nem fim.
 *
 * A ficha é conferida DEPOIS de criar a conta e antes do SMS (guia 5.12): o
 * banco só confere com login e com os três dados, e não só pelo CPF.
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

  const password = watch('password');

  // Idade conferida ao vivo: assim que a data de nascimento fica completa, quem
  // tem menos de 18 anos já vê o aviso em vermelho, e o "Criar conta" trava.
  const underage = isUnderage(watch('birthDate'));

  // Com o teclado aberto, a frase da capa recolhe, o campo em foco vai para o
  // meio do que sobra e o rodapé fica só com o "Criar conta".
  const keyboardOpen = useSoftKeyboard();

  return (
    <FlowScreen
      tone="brand"
      title="Criar conta"
      subtitle="Preencha seus dados para acessar o app."
      // Capa baixa: o título na linha do voltar, para o formulário começar logo.
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
            Criar conta
          </Button>
          {!keyboardOpen && (
            <Button variant="ghost" fullWidth onClick={onSignIn}>
              Já tenho conta
            </Button>
          )}
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
          {/* Título de bloco do guia (`text-card-title`, 17/22, um ponto abaixo
              dele) em negrito, no verde dos títulos. A `<legend>` fica fora do
              reset de `index.css`, então o `mb-3` vale. */}
          <legend className="mb-3 text-card-title font-bold text-primary-deep">Seus dados</legend>
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
                // Digitada, sem calendário (24/10). Menor de 18 vê o aviso
                // assim que a data fica completa.
                error={fieldState.error?.message ?? (underage ? UNDERAGE_MESSAGE : undefined)}
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
          <legend className="mb-3 text-card-title font-bold text-primary-deep">Seu acesso</legend>
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
            <InlineError title={error} description="" />
          </div>
        )}
      </form>
    </FlowScreen>
  );
}
