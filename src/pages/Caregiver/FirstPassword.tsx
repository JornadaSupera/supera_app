import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useNavigate } from 'react-router';
import FlowScreen from '../../components/ui/flow-screen';
import Button from '../../components/ui/button';
import PasswordInput from '../../components/ui/password-input';
import PasswordStrengthMeter from '../../components/ui/password-strength-meter';
import { describeMutationError, useSignOut } from '../../hooks/useAuth';
import { useCompleteFirstPassword } from '../../hooks/useCaregiver';
import { useToast } from '../../contexts/ToastContext';
import {
  FIRST_PASSWORD_MIN_LENGTH,
  caregiverFirstPasswordSchema,
  type CaregiverFirstPasswordFormValues,
} from '../../schemas/caregiver';
import { useSessionStore } from '../../stores/sessionStore';

const FORM_ID = 'first-password-form';

/**
 * Primeiro acesso do acompanhante: trocar a senha provisória por uma só dele.
 *
 * É a única tela que abre enquanto a sessão carrega `must_change_password`
 * (ver `RequireAuth`), e o banco também não entrega nenhum dado antes da troca.
 * Sem seta de voltar: não há para onde voltar. Quem não consegue seguir sai da
 * conta e pede outra senha provisória a quem o cadastrou.
 */
export default function FirstPassword() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const mustChangePassword = useSessionStore((state) => state.mustChangePassword);
  const completePassword = useCompleteFirstPassword();
  const signOut = useSignOut();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isValid },
  } = useForm<CaregiverFirstPasswordFormValues>({
    // NÃO é `newPasswordSchema`: quem recusa aqui é a Edge Function
    // `complete-first-password`, que exige 10 caracteres com letra e dígito.
    // Com o mínimo do app (8, sem dígito) o formulário aceitaria uma senha que
    // o servidor devolve como `weak_password`.
    resolver: zodResolver(caregiverFirstPasswordSchema),
    mode: 'onChange',
    defaultValues: { password: '', confirmPassword: '' },
  });

  const password = watch('password');
  const confirmPassword = watch('confirmPassword');

  // Quem não tem senha provisória a trocar (ou já a trocou) não pertence a
  // esta tela: digitar o endereço não a abre.
  if (!mustChangePassword) return <Navigate to="/home" replace />;

  const submit = handleSubmit(async (values) => {
    try {
      await completePassword.mutateAsync(values.password);
      showToast('Senha criada. Bem-vindo(a) à Jornada Supera.', { variant: 'success' });
      navigate('/home', { replace: true });
    } catch {
      // A mensagem aparece abaixo do formulário, lida do próprio erro da mutation.
    }
  });

  return (
    <FlowScreen
      title="Crie a sua senha"
      subtitle="Você entrou com uma senha provisória. Para continuar, escolha uma senha só sua."
      footer={
        <>
          {completePassword.isError && (
            <p role="alert" className="text-center text-[12px] text-destructive">
              {describeMutationError(completePassword.error, 'Não foi possível salvar a senha. Tente novamente.')}
            </p>
          )}
          <Button type="submit" form={FORM_ID} fullWidth disabled={!isValid} loading={completePassword.isPending}>
            Salvar e continuar
          </Button>
          <Button variant="ghost" fullWidth loading={signOut.isPending} onClick={() => signOut.mutate()}>
            Sair
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
        <div className="flex flex-col gap-2">
          <PasswordInput
            label="Nova senha"
            id="first-password"
            autoComplete="new-password"
            placeholder={`Mínimo de ${FIRST_PASSWORD_MIN_LENGTH} caracteres, com letras e números`}
            error={errors.password?.message}
            {...register('password')}
          />
          <PasswordStrengthMeter password={password} />
        </div>

        <PasswordInput
          label="Confirmar nova senha"
          id="first-password-confirm"
          autoComplete="new-password"
          placeholder="Repita a senha"
          error={confirmPassword ? errors.confirmPassword?.message : undefined}
          {...register('confirmPassword')}
        />
      </form>
    </FlowScreen>
  );
}
