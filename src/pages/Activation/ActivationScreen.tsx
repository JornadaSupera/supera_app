import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import FlowScreen from '../../components/ui/flow-screen';
import Input from '../../components/ui/input';
import DateField from '../../components/ui/date-field';
import Button from '../../components/ui/button';
import { describeMutationError, useActivatePatientAccount } from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';
import { useSessionStore } from '../../stores/sessionStore';
import {
  ACTIVATION_CODE_LENGTH,
  activationSchema,
  normalizeActivationCode,
  type ActivationFormValues,
  type ActivationValues,
} from '../../schemas/activation';
import { formatCPF } from '../../utils/masks';
import { maskedRegister } from '../../utils/maskedInput';
import { todayInClinicTimeZone } from '../../utils/date';

const FORM_ID = 'activation-form';

export interface ActivationScreenProps {
  /**
   * CPF e nascimento que a pessoa acabou de informar no cadastro, ainda em
   * memória. Quando vêm, a tela pede só o código — repetir os dois seria pedir
   * a mesma coisa duas vezes na mesma sessão.
   */
  known?: { cpf: string; birthDate: string };
  onBack?: () => void;
  /** A saída de quem não tem o código agora (ou quer trocar de conta). */
  secondary: { label: string; onClick: () => void; loading?: boolean };
  /** O cadastro foi confirmado e a identidade já foi relida: seguir para o app. */
  onActivated: () => void;
}

/**
 * Confirmar o cadastro com o código de ativação que a recepção gerou no painel.
 *
 * O código tem 64 caracteres e a pessoa não o digita: cola o que recebeu — do
 * WhatsApp, do SMS. Por isso o campo mostra quantos caracteres já entraram, que
 * é o que denuncia a cópia truncada (o erro mais comum), e o formato é
 * conferido antes de ir ao servidor. Quem decide se o código vale — junto com o
 * CPF e o nascimento — é o banco, e ele responde igual para qualquer
 * divergência.
 *
 * Nada daqui vai para armazenamento: código, CPF e nascimento vivem só no
 * formulário. E o código nunca viaja na URL (ficaria no histórico do
 * navegador e no `Referer`).
 */
export default function ActivationScreen({
  known,
  onBack,
  secondary,
  onActivated,
}: ActivationScreenProps) {
  const { showToast } = useToast();
  const activation = useActivatePatientAccount();

  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<ActivationFormValues, unknown, ActivationValues>({
    resolver: zodResolver(activationSchema),
    mode: 'onTouched',
    defaultValues: { token: '', cpf: known?.cpf ?? '', birthDate: known?.birthDate ?? '' },
  });

  const typedLength = normalizeActivationCode(watch('token')).length;

  const submit = handleSubmit((values) => {
    activation.mutate(values, {
      onSuccess: () => {
        // A confirmação deu certo no banco, mas a identidade não recarregou (a
        // rede oscilou na releitura): seguir para a Home cairia de novo na tela
        // de espera. Entrar de novo resolve, e dizer isso é melhor que um laço.
        //
        // "com o mesmo e-mail" não é enfeite: o código já foi consumido, e quem
        // cria uma segunda conta aqui não consegue mais confirmar sozinho.
        if (useSessionStore.getState().status !== 'autenticado') {
          showToast(
            'Cadastro confirmado. Não conseguimos carregar seus dados agora — saia e entre novamente com o mesmo e-mail.',
            { variant: 'info' }
          );
          return;
        }

        showToast('Cadastro confirmado. Bem-vindo(a) à Jornada Supera!', { variant: 'success' });
        onActivated();
      },
    });
  });

  return (
    <FlowScreen
      title="Confirme seu cadastro"
      subtitle={
        known
          ? 'Digite o código de ativação que a recepção do Centro gerou para você.'
          : 'Informe o código de ativação da recepção e os dados do seu cadastro.'
      }
      onBack={onBack}
      footer={
        <>
          <Button type="submit" form={FORM_ID} fullWidth loading={activation.isPending}>
            Confirmar cadastro
          </Button>
          <Button variant="ghost" fullWidth loading={secondary.loading} onClick={secondary.onClick}>
            {secondary.label}
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
          label="Código de ativação"
          id="activation-token"
          // O código é de uso único: o navegador não deve guardá-lo nem sugeri-lo,
          // e o teclado do celular não pode capitalizá-lo nem corrigi-lo.
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Cole aqui o código"
          inputClassName="font-mono text-[13px]"
          helperText={
            typedLength === 0
              ? 'Cole o código exatamente como a recepção enviou.'
              : `${Math.min(typedLength, ACTIVATION_CODE_LENGTH)} de ${ACTIVATION_CODE_LENGTH} caracteres`
          }
          error={errors.token?.message}
          {...register('token')}
        />

        {!known && (
          <>
            <Input
              label="CPF"
              id="activation-cpf"
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
                  id="activation-birth-date"
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
          </>
        )}

        {activation.isError && (
          <div>
            <p role="alert" className="text-[12px]/[1.5] text-destructive">
              {describeMutationError(activation.error, 'Não foi possível confirmar seu cadastro.')}
            </p>
          </div>
        )}

        {/* O espaço entre os textos é `gap` do contêiner: o reset de `index.css`
            zera a margem de `<p>` e vence `mt-*`. */}
        <div>
          <p className="text-[12px]/[1.5] text-muted-foreground">
            Não recebeu o código, ou ele venceu? Só a recepção do Centro pode gerar outro.
          </p>
        </div>
      </form>
    </FlowScreen>
  );
}
