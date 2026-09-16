import { useState, type ReactNode } from 'react';
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

// Identificação de quem chegou com um código em mãos — convite de
// acompanhante ou ativação do paciente. Não é o `/login`: a pessoa quase
// sempre ainda não tem conta, e mandá-la para outra tela tiraria o código do
// caminho no meio do fluxo.

type AuthTab = 'sign-in' | 'sign-up';

interface AuthFormProps {
  idPrefix: string;
}

function SignInForm({ idPrefix }: AuthFormProps) {
  const signInMutation = useSignIn();
  const formId = `${idPrefix}-sign-in`;

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
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) => signInMutation.mutate(values))}
      >
        <Input
          label="E-mail"
          id={`${idPrefix}-login-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordInput
          label="Senha"
          id={`${idPrefix}-login-password`}
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

      <Button type="submit" form={formId} fullWidth className="mt-5" loading={signInMutation.isPending}>
        Entrar
      </Button>
    </>
  );
}

interface SignUpFormProps extends AuthFormProps {
  emailConfirmationMessage: string;
}

function SignUpForm({ idPrefix, emailConfirmationMessage }: SignUpFormProps) {
  const signUpMutation = useSignUp();
  const formId = `${idPrefix}-sign-up`;

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
        <p className="text-[13px]/[1.5] text-muted-foreground">{emailConfirmationMessage}</p>
      </div>
    );
  }

  return (
    <>
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) =>
          signUpMutation.mutate({
            fullName: values.fullName,
            email: values.email,
            password: values.password,
          })
        )}
      >
        <Input
          label="Seu nome completo"
          id={`${idPrefix}-name`}
          autoComplete="name"
          placeholder="Como você quer ser identificado"
          error={errors.fullName?.message}
          {...register('fullName')}
        />
        <Input
          label="E-mail"
          id={`${idPrefix}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordInput
          label="Senha"
          id={`${idPrefix}-password`}
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <PasswordInput
          label="Confirme a senha"
          id={`${idPrefix}-password-confirm`}
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

      <Button type="submit" form={formId} fullWidth className="mt-5" loading={signUpMutation.isPending}>
        Criar conta
      </Button>
    </>
  );
}

interface AccountAuthPanelProps {
  /** Prefixo dos `id` dos campos — duas telas não podem gerar o mesmo `id`. */
  idPrefix: string;
  /** Texto sob "Primeiro, identifique-se": explica de quem é a conta que vai ser usada. */
  intro: ReactNode;
  /** O que dizer quando o cadastro exige confirmar o e-mail antes de seguir. */
  emailConfirmationMessage: string;
}

export default function AccountAuthPanel({
  idPrefix,
  intro,
  emailConfirmationMessage,
}: AccountAuthPanelProps) {
  const [tab, setTab] = useState<AuthTab>('sign-up');

  return (
    <section>
      <h2 className="mb-1 text-[16px] font-semibold text-foreground">Primeiro, identifique-se</h2>
      <p className="mb-4 text-[13px]/[1.5] text-muted-foreground">{intro}</p>

      {/* Grupo de dois botões de alternância, e não `tablist`/`tab`.
          O `Tag` clicável já emite `aria-pressed` (ver `tag.tsx`), e
          `aria-pressed` é atributo proibido em `role="tab"` — o par gerava
          `<button role="tab" aria-selected aria-pressed>`, que o axe reprova em
          `aria-allowed-attr` e que o leitor de tela anuncia como estado duplo.
          Chamar de aba também prometia o que não existia: o padrão ARIA de abas
          exige `aria-controls` apontando para um `role="tabpanel"` e navegação
          por seta, e aqui não havia nem um nem outro. Dois botões de alternância
          num grupo rotulado descrevem o que a tela faz de verdade. */}
      <div className="mb-5 flex gap-2" role="group" aria-label="Como você quer continuar">
        <Tag
          className="min-h-11 px-4 py-2"
          selected={tab === 'sign-up'}
          onClick={() => setTab('sign-up')}
        >
          Criar conta
        </Tag>
        <Tag
          className="min-h-11 px-4 py-2"
          selected={tab === 'sign-in'}
          onClick={() => setTab('sign-in')}
        >
          Já tenho conta
        </Tag>
      </div>

      {/* Remonta o formulário ao trocar de aba: sem a `key`, o React reusaria
          a instância e os campos de senha de um fluxo apareceriam no outro. */}
      {tab === 'sign-up' ? (
        <SignUpForm
          key="sign-up"
          idPrefix={idPrefix}
          emailConfirmationMessage={emailConfirmationMessage}
        />
      ) : (
        <SignInForm key="sign-in" idPrefix={idPrefix} />
      )}
    </section>
  );
}
