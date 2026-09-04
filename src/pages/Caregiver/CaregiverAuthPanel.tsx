import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import Input from '../../components/ui/input';
import PasswordInput from '../../components/ui/password-input';
import Button from '../../components/ui/button';
import Tag from '../../components/ui/tag';
import { signInSchema, signUpSchema } from '../../schemas/auth';
import type { SignInFormValues, SignUpFormValues } from '../../schemas/auth';
import { describeMutationError, useSignIn, useSignUp } from '../../hooks/useAuth';

// Identificação de quem chegou por convite. Fica nesta pasta, e não em
// `Login/`, porque é um caminho próprio: quem convida entrega um código, e a
// pessoa convidada quase sempre ainda não tem conta. Mandá-la para `/login`
// tiraria o código da tela no meio do caminho.

type Aba = 'entrar' | 'criar';

const SIGN_IN_FORM_ID = 'caregiver-sign-in';
const SIGN_UP_FORM_ID = 'caregiver-sign-up';

function SignInForm() {
  const signInMutation = useSignIn();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  return (
    <>
      <form
        id={SIGN_IN_FORM_ID}
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((valores) => signInMutation.mutate(valores))}
      >
        <Input
          label="E-mail"
          id="cuidador-login-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordInput
          label="Senha"
          id="cuidador-login-senha"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
      </form>

      {signInMutation.isError && (
        <p role="alert" className="mt-3 text-[12px] text-destructive">
          {describeMutationError(signInMutation.error, 'Não foi possível entrar.')}
        </p>
      )}

      <Button
        type="submit"
        form={SIGN_IN_FORM_ID}
        fullWidth
        className="mt-5"
        loading={signInMutation.isPending}
      >
        Entrar
      </Button>
    </>
  );
}

function SignUpForm() {
  const signUpMutation = useSignUp();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  });

  // Projeto com confirmação de e-mail ligada não devolve sessão no cadastro.
  // Seguir para o código aqui só produziria `42501` — a RPC exige `auth.uid()`.
  if (signUpMutation.data?.needsEmailConfirmation) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-5 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-mood-1)_15%,transparent)] text-[var(--color-mood-1)]">
          <MailCheck size={20} strokeWidth={2} aria-hidden="true" />
        </span>
        <p className="text-[15px] font-semibold text-foreground">Confirme seu e-mail</p>
        <p className="text-[13px]/[1.5] text-muted-foreground">
          Enviamos um link de confirmação. Abra-o e volte a esta tela para informar o código do
          convite — ele continua valendo.
        </p>
      </div>
    );
  }

  return (
    <>
      <form
        id={SIGN_UP_FORM_ID}
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((valores) =>
          signUpMutation.mutate({
            fullName: valores.fullName,
            email: valores.email,
            password: valores.password,
          })
        )}
      >
        <Input
          label="Seu nome completo"
          id="cuidador-nome"
          autoComplete="name"
          placeholder="Como você quer ser identificado"
          error={errors.fullName?.message}
          {...register('fullName')}
        />
        <Input
          label="E-mail"
          id="cuidador-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordInput
          label="Senha"
          id="cuidador-senha"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <PasswordInput
          label="Confirme a senha"
          id="cuidador-senha-confirma"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
      </form>

      {signUpMutation.isError && (
        <p role="alert" className="mt-3 text-[12px] text-destructive">
          {describeMutationError(signUpMutation.error, 'Não foi possível criar a conta.')}
        </p>
      )}

      <Button
        type="submit"
        form={SIGN_UP_FORM_ID}
        fullWidth
        className="mt-5"
        loading={signUpMutation.isPending}
      >
        Criar conta
      </Button>
    </>
  );
}

export default function CaregiverAuthPanel() {
  const [aba, setAba] = useState<Aba>('criar');

  return (
    <section>
      <h2 className="mb-1 text-[16px] font-semibold text-foreground">
        Primeiro, identifique-se
      </h2>
      <p className="mb-4 text-[13px]/[1.5] text-muted-foreground">
        Você vai acompanhar com <strong>o seu próprio login</strong> — nunca com a senha da pessoa
        que te convidou.
      </p>

      <div className="mb-5 flex gap-2" role="tablist" aria-label="Como você quer continuar">
        <Tag
          className="min-h-11 px-4 py-2"
          role="tab"
          aria-selected={aba === 'criar'}
          selected={aba === 'criar'}
          onClick={() => setAba('criar')}
        >
          Criar conta
        </Tag>
        <Tag
          className="min-h-11 px-4 py-2"
          role="tab"
          aria-selected={aba === 'entrar'}
          selected={aba === 'entrar'}
          onClick={() => setAba('entrar')}
        >
          Já tenho conta
        </Tag>
      </div>

      {/* Remonta o formulário ao trocar de aba: sem a `key`, o React reusaria
          a instância e os campos de senha de um fluxo apareceriam no outro. */}
      {aba === 'criar' ? <SignUpForm key="criar" /> : <SignInForm key="entrar" />}
    </section>
  );
}
