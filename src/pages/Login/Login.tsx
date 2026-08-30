import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FingerprintPattern } from 'lucide-react';
import Button from '../../components/ui/button';
import Input from '../../components/ui/input';
import { LogoMark } from '../../components/ui/logo';
import { useToast } from '../../contexts/ToastContext';
import { signInSchema, type SignInFormValues } from '../../schemas/auth';
import { describeMutationError, useSignIn } from '../../hooks/useAuth';
import { hasStoredSession } from '../../services/mockApi';
import { isBiometricAvailable, authenticateWithBiometric } from '../../services/biometric';
import { useSessionStore } from '../../stores/sessionStore';
import { identifyPushUser } from '../../services/pushNotifications';

// Ícones de marca (Google/Apple) não existem no lucide-react — inline SVG
// fiel ao protótipo (`.../paciente/login/`), só usado nesta tela.
function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function AppleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.47-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

const FORM_ID = 'login-form';

export default function Login() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const refreshIdentity = useSessionStore((state) => state.refreshIdentity);
  const signInMutation = useSignIn();

  const [autenticandoBiometria, setAutenticandoBiometria] = useState(false);

  // Duas queries independentes em vez de um `Promise.all`: cada recurso cuida
  // do próprio carregamento, então o suporte a biometria não fica refém da
  // leitura do cofre (e vice-versa).
  const { data: biometriaSuportada } = useQuery({
    queryKey: ['biometric-available'],
    queryFn: isBiometricAvailable,
  });
  const { data: sessaoGuardada } = useQuery({
    queryKey: ['stored-session'],
    queryFn: hasStoredSession,
  });

  // Biometria destrava uma sessão que já existe — ela não autentica ninguém
  // contra o servidor. Sem sessão guardada no cofre não há o que destravar, e
  // oferecer o atalho seria prometer um caminho que não leva a lugar nenhum.
  const biometriaDisponivel = Boolean(biometriaSuportada) && Boolean(sessaoGuardada);

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async ({ email, password }: SignInFormValues) => {
    clearErrors('root');

    try {
      const identity = await signInMutation.mutateAsync({ email, password });

      // O identificador de push é a conta, não o paciente: ele serve para
      // endereçar o aparelho, e não precisa carregar identidade clínica.
      identifyPushUser(identity.accountId);

      showToast('Login efetuado. Bem-vindo(a) à Jornada Supera.', { variant: 'success' });
      navigate('/home', { replace: true });
    } catch (error) {
      const mensagem = describeMutationError(error, 'Não foi possível entrar.');
      // `root` guarda o erro vindo do servidor — não pertence a um campo
      // específico, e é o que alimenta o alerta no topo da tela.
      setError('root', { message: mensagem });
      showToast(mensagem, { variant: 'error' });
    }
  };

  const handleBiometricLogin = async () => {
    if (autenticandoBiometria) return;

    setAutenticandoBiometria(true);
    try {
      const autenticado = await authenticateWithBiometric();

      if (!autenticado) {
        showToast('Não foi possível confirmar sua biometria. Tente novamente ou use sua senha.', {
          variant: 'error',
        });
        return;
      }

      // A sessão já está no cofre; o que faltava era saber quem é o dono dela.
      await refreshIdentity();
      showToast('Identidade confirmada. Bem-vindo(a) de volta à Jornada Supera.', {
        variant: 'success',
      });
      navigate('/home', { replace: true });
    } finally {
      setAutenticandoBiometria(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <main className="flex-1 px-6 pt-12 pb-6">
        <div className="flex flex-col items-center text-center">
          <LogoMark size={48} />
          <h1 className="mt-4 text-center text-[20px] font-semibold tracking-[-0.3px] text-foreground">
            Bem-vindo de volta
          </h1>
          <p className="mt-1 text-center text-[14px] text-muted-foreground">
            Entre para acompanhar seu tratamento.
          </p>
        </div>

        {errors.root?.message && (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] p-3 text-[13px] text-destructive"
          >
            {errors.root.message}
          </div>
        )}

        <form id={FORM_ID} className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          <Input
            label="E-mail"
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="voce@email.com"
            error={errors.email?.message}
            {...register('email')}
          />

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="password" className="text-[13px] font-medium text-foreground">
                Senha
              </label>
              <button
                type="button"
                className="-my-4 cursor-pointer border-none bg-transparent py-4 text-[11px] font-medium text-primary"
                onClick={() => navigate('/recuperar-senha')}
              >
                Esqueci minha senha
              </button>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password')}
            />
          </div>
        </form>

        <div className="mt-4 flex items-center gap-2">
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          <span className="text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
            ou
          </span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {biometriaDisponivel && (
            <Button
              fullWidth
              variant="outline"
              iconLeft={FingerprintPattern}
              loading={autenticandoBiometria}
              onClick={handleBiometricLogin}
            >
              Entrar com biometria
            </Button>
          )}
          <Button
            fullWidth
            variant="outline"
            iconLeft={GoogleIcon}
            onClick={() =>
              showToast('O login com Google não está disponível nesta demonstração.', {
                variant: 'info',
              })
            }
          >
            Entrar com Google
          </Button>
          <Button
            fullWidth
            variant="outline"
            iconLeft={AppleIcon}
            onClick={() =>
              showToast('O login com Apple não está disponível nesta demonstração.', {
                variant: 'info',
              })
            }
          >
            Entrar com Apple
          </Button>
        </div>
      </main>

      <footer className="sticky bottom-0 border-t border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] px-6 py-4 backdrop-blur-[8px]">
        {/* O botão vive fora do <form> (o rodapé é sticky), então se conecta a
            ele por `form=` — assim o Enter nos campos também envia. */}
        <Button type="submit" form={FORM_ID} fullWidth iconRight={ArrowRight} loading={isSubmitting}>
          Entrar
        </Button>
      </footer>
    </div>
  );
}
