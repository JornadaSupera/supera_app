import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useNavigate } from 'react-router';
import { ChevronRight } from 'lucide-react';
import Button from '../../components/ui/button';
import PasswordInput from '../../components/ui/password-input';
import Header from '../../components/ui/header';
import Loading from '../../components/ui/loading';
import PasswordStrengthMeter from '../../components/ui/password-strength-meter';
import { useToast } from '../../contexts/ToastContext';
import { newPasswordSchema, type NewPasswordFormValues } from '../../schemas/auth';
import { describeMutationError, useResetPassword } from '../../hooks/useAuth';
import { useSessionStore } from '../../stores/sessionStore';

const FORM_ID = 'new-password-form';

export default function NewPassword() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const status = useSessionStore((state) => state.status);
  const recoveryPending = useSessionStore((state) => state.recoveryPending);
  const signOut = useSessionStore((state) => state.signOut);
  const resetPasswordMutation = useResetPassword();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting, isValid },
  } = useForm<NewPasswordFormValues>({
    resolver: zodResolver(newPasswordSchema),
    mode: 'onChange',
    defaultValues: { password: '', confirmPassword: '' },
  });

  const password = watch('password');
  const confirmPassword = watch('confirmPassword');

  // O cofre ainda não respondeu: decidir agora mandaria de volta para a
  // recuperação quem acabou de chegar por um link válido.
  if (status === 'verificando') {
    return <Loading />;
  }

  // Guarda de rota. Quem chega pelo link do e-mail ganha uma sessão de
  // recuperação (evento `PASSWORD_RECOVERY`); quem já está logado também pode
  // trocar a senha. Sem nenhum dos dois não há o que redefinir — digitar a
  // rota na barra de endereços não deve abrir o formulário.
  if (!recoveryPending && status === 'anonimo') {
    return <Navigate to="/recuperar-senha" replace />;
  }

  const onSubmit = async ({ password: novaSenha }: NewPasswordFormValues) => {
    try {
      await resetPasswordMutation.mutateAsync({ password: novaSenha });

      // Encerra a sessão de recuperação: ela existe para autorizar esta troca
      // e nada mais. Deixá-la aberta significaria que qualquer pessoa com o
      // link ficaria dentro do app sem nunca ter digitado a senha nova.
      await signOut();

      showToast('Senha redefinida com sucesso. Faça login com sua nova senha.', {
        variant: 'success',
      });
      navigate('/login', { replace: true });
    } catch (error) {
      showToast(describeMutationError(error, 'Não foi possível redefinir sua senha.'), {
        variant: 'error',
      });
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Header title="Nova senha" onBack={() => navigate('/recuperar-senha')} sticky bordered />

      <main className="flex-1 px-6 pb-6">
        <p className="pt-2 text-[14px] text-muted-foreground">
          Crie uma senha nova para sua conta. Use uma senha que você lembre — mas que ninguém
          adivinhe.
        </p>

        <form id={FORM_ID} className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <PasswordInput
              label="Nova senha"
              id="password"
              autoComplete="new-password"
              placeholder="Mínimo de 8 caracteres"
              {...register('password')}
            />
            <div className="mt-2">
              <PasswordStrengthMeter password={password} />
            </div>
          </div>

          <PasswordInput
            label="Confirmar nova senha"
            id="confirmPassword"
            autoComplete="new-password"
            placeholder="Repita a senha"
            error={confirmPassword ? errors.confirmPassword?.message : undefined}
            {...register('confirmPassword')}
          />
        </form>
      </main>

      <footer className="sticky bottom-0 border-t border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] px-6 py-4 backdrop-blur-[8px]">
        <Button
          type="submit"
          form={FORM_ID}
          fullWidth
          iconRight={ChevronRight}
          disabled={!isValid}
          loading={isSubmitting}
        >
          Redefinir senha
        </Button>
      </footer>
    </div>
  );
}
