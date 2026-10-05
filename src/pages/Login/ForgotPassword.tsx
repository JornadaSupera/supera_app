import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight } from 'lucide-react';
import Button from '../../components/ui/button';
import FlowScreen from '../../components/ui/flow-screen';
import Input from '../../components/ui/input';
import EntryHero from '../Onboarding/EntryHero';
import {
  passwordResetRequestSchema,
  type PasswordResetRequestFormValues,
} from '../../schemas/auth';
import { describeMutationError, useRequestPasswordReset } from '../../hooks/useAuth';

const FORM_ID = 'forgot-password-form';

/** O nome do fluxo, ao lado do voltar, nas duas etapas. */
const FLOW_LABEL = 'Recuperar senha';

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

  const goToLogin = () => navigate('/login');

  // As duas etapas têm `key` própria: a tela remonta, e a entrada da capa (o
  // título, o medalhão, o conteúdo) roda de novo — é a confirmação de que o
  // link saiu. Também impede que um botão de uma etapa seja reaproveitado
  // pela outra no meio de um toque.
  if (etapa === 'enviado') {
    return (
      <FlowScreen
        key="enviado"
        tone="brand"
        meta={FLOW_LABEL}
        title="Verifique seu e-mail"
        subtitle="Se esse cadastro existir, enviamos um link para redefinir a senha. Pode levar alguns minutos para chegar."
        hero={<EntryHero variant="mail" />}
        onBack={goToLogin}
        footer={
          <>
            <Button fullWidth variant="ghost" onClick={goToLogin}>
              Voltar para o login
            </Button>
            {/* Volta para o formulário sem perder a navegação (Login → aqui):
                digitar o e-mail errado não deveria custar dois cliques a mais
                pra corrigir. O campo mantém o que foi digitado — dá pra só
                editar. */}
            <button
              type="button"
              className="min-h-[44px] cursor-pointer border-none bg-transparent text-center text-[12px] font-medium text-primary-deep hover:underline"
              onClick={() => setEtapa('form')}
            >
              Tentar com outro e-mail
            </button>
          </>
        }
      >
        <p className="text-[12px] text-muted-foreground">
          Não recebeu? Verifique a caixa de spam ou tente novamente em alguns minutos.
        </p>
        {/* O link precisa ser aberto neste mesmo aparelho: a redefinição
            usa PKCE, e o verifier fica no cofre local de quem pediu. */}
        <p className="text-[12px] text-muted-foreground">
          Abra o link neste mesmo celular — é ele que guarda a chave da
          redefinição.
        </p>
      </FlowScreen>
    );
  }

  return (
    <FlowScreen
      key="form"
      tone="brand"
      meta={FLOW_LABEL}
      title="Esqueci minha senha"
      subtitle="Informe o e-mail do seu cadastro. Enviaremos um link para você criar uma senha nova."
      hero={<EntryHero variant="key" />}
      onBack={goToLogin}
      footer={
        <Button
          type="submit"
          form={FORM_ID}
          variant="brand"
          size="xl"
          sheen
          fullWidth
          iconRight={ChevronRight}
          loading={isSubmitting}
        >
          Enviar link
        </Button>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit(onSubmit)}>
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
          className="rounded-lg border border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] p-3 text-[13px] text-destructive"
        >
          {errors.root.message}
        </div>
      )}
    </FlowScreen>
  );
}
