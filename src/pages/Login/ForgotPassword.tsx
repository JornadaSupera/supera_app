import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight, KeyRound, MailCheck } from 'lucide-react';
import StickyFooter from '../../components/ui/sticky-footer';
import Button from '../../components/ui/button';
import Input from '../../components/ui/input';
import PageHeader from '../../components/ui/page-header';
import IconHeading from '../../components/ui/icon-heading';
import {
  passwordResetRequestSchema,
  type PasswordResetRequestFormValues,
} from '../../schemas/auth';
import { describeMutationError, useRequestPasswordReset } from '../../hooks/useAuth';

const FORM_ID = 'forgot-password-form';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const requestResetMutation = useRequestPasswordReset();

  const [etapa, setEtapa] = useState<'form' | 'enviado'>('form');

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<PasswordResetRequestFormValues>({
    resolver: zodResolver(passwordResetRequestSchema),
    mode: 'onTouched',
    defaultValues: { identifier: '' },
  });

  const onSubmit = async ({ identifier }: PasswordResetRequestFormValues) => {
    clearErrors('root');

    try {
      await requestResetMutation.mutateAsync({ identifier });
      setEtapa('enviado');
    } catch (error) {
      const mensagem = describeMutationError(error, 'Não foi possível enviar o link.');
      setError('root', { message: mensagem });
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <PageHeader title="Recuperar senha" onBack={() => navigate('/login')} />

      {etapa === 'form' ? (
        <>
          <main className="flex-1 px-6 py-5">
            <IconHeading
              icon={KeyRound}
              iconTone="var(--color-primary)"
              title="Esqueci minha senha"
              description="Informe o e-mail do seu cadastro. Enviaremos um link para você criar uma senha nova."
              align="left"
            />

            <form id={FORM_ID} className="mt-6" onSubmit={handleSubmit(onSubmit)}>
              <Input
                label="E-mail"
                id="identifier"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="voce@email.com"
                error={errors.identifier?.message}
                {...register('identifier')}
              />
            </form>

            {errors.root?.message && (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] p-3 text-[13px] text-destructive"
              >
                {errors.root.message}
              </div>
            )}
          </main>

          <StickyFooter>
            <Button
              type="submit"
              form={FORM_ID}
              fullWidth
              iconRight={ChevronRight}
              loading={isSubmitting}
            >
              Enviar link
            </Button>
          </StickyFooter>
        </>
      ) : (
        <>
          <main className="flex-1 px-6 py-5">
            <IconHeading
              icon={MailCheck}
              iconTone="var(--color-primary)"
              title="Verifique seu e-mail"
              description="Se esse cadastro existir, enviamos um link para redefinir a senha. Pode levar alguns minutos para chegar."
              align="center"
            />
            <p className="mt-2 text-center text-[12px] text-muted-foreground">
              Não recebeu? Verifique a caixa de spam ou tente novamente em alguns minutos.
            </p>
            {/* O link precisa ser aberto neste mesmo aparelho: a redefinição
                usa PKCE, e o verifier fica no cofre local de quem pediu. */}
            <p className="mt-3 text-center text-[12px] text-muted-foreground">
              Abra o link neste mesmo celular — é ele que guarda a chave da
              redefinição.
            </p>
          </main>

          <StickyFooter className="flex flex-col gap-3">
            <Button fullWidth variant="ghost" onClick={() => navigate('/login')}>
              Voltar para o login
            </Button>
            {/* Volta para o formulário sem perder a navegação (Login → aqui):
                digitar o e-mail errado não deveria custar dois cliques a mais
                pra corrigir. O campo mantém o que foi digitado — dá pra só
                editar. */}
            <button
              type="button"
              className="min-h-[44px] cursor-pointer border-none bg-transparent text-center text-[12px] font-medium text-primary hover:underline"
              onClick={() => setEtapa('form')}
            >
              Tentar com outro e-mail
            </button>
          </StickyFooter>
        </>
      )}
    </div>
  );
}
