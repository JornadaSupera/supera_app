import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useNavigate } from 'react-router';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import Button from '../../components/ui/button';
import PasswordInput from '../../components/ui/password-input';
import Header from '../../components/ui/header';
import IconHeading from '../../components/ui/icon-heading';
import Loading from '../../components/ui/loading';
import PasswordStrengthMeter from '../../components/ui/password-strength-meter';
import { useToast } from '../../contexts/ToastContext';
import { newPasswordSchema, type NewPasswordFormValues } from '../../schemas/auth';
import { describeMutationError, useResetPassword } from '../../hooks/useAuth';
import { useSessionStore } from '../../stores/sessionStore';

const FORM_ID = 'new-password-form';

/**
 * O GoTrue devolve o paciente para esta rota mesmo quando o link falha — só
 * que sem sessão nenhuma, e com o motivo embutido na URL (hash OU query,
 * dependendo do tipo de erro). Um link expirado ou já usado é o caso mais
 * comum, já que a validade é curta. Sem checar isto, a tela simplesmente
 * manda a pessoa de volta pro formulário de pedir o link, sem dizer por quê.
 */
function getRecoveryLinkError(): string | null {
  const bruto = window.location.hash.replace(/^#/, '') || window.location.search.replace(/^\?/, '');
  if (!bruto) return null;

  const params = new URLSearchParams(bruto);
  const codigo = params.get('error_code');
  const descricao = params.get('error_description');

  if (!codigo && !descricao) return null;

  if (codigo === 'otp_expired') {
    return 'Este link expirou. Peça um novo para redefinir sua senha.';
  }

  return descricao
    ? descricao.replace(/\+/g, ' ')
    : 'Não foi possível validar o link. Peça um novo para redefinir sua senha.';
}

export default function NewPassword() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const status = useSessionStore((state) => state.status);
  const recoveryPending = useSessionStore((state) => state.recoveryPending);
  const signOut = useSessionStore((state) => state.signOut);
  const resetPasswordMutation = useResetPassword();

  // Lida uma vez só, do estado inicial: a própria troca de senha bem
  // sucedida navega para `/login` antes de qualquer novo carregamento desta
  // rota, então não há necessidade de reavaliar a URL depois do primeiro
  // render.
  const [linkError] = useState(getRecoveryLinkError);

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

  // Link inválido/expirado tem prioridade sobre qualquer outro estado: é
  // exatamente o motivo de a sessão não ter resolvido, e a pessoa precisa
  // saber disso — não só ser devolvida ao formulário em silêncio.
  if (linkError) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <Header title="Nova senha" onBack={() => navigate('/recuperar-senha')} sticky bordered />

        <main className="flex-1 px-6 py-5">
          <IconHeading
            icon={TriangleAlert}
            iconTone="var(--color-destructive)"
            title="Link inválido"
            description={linkError}
            align="left"
          />
        </main>

        <footer className="sticky bottom-0 border-t border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] px-6 py-4 backdrop-blur-[8px]">
          <Button fullWidth iconRight={ChevronRight} onClick={() => navigate('/recuperar-senha')}>
            Pedir novo link
          </Button>
        </footer>
      </div>
    );
  }

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
