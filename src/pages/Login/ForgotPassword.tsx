import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronRight, KeyRound, MailCheck } from 'lucide-react';
import Button from '../../components/ui/button';
import Input from '../../components/ui/input';
import Header from '../../components/ui/header';
import IconHeading from '../../components/ui/icon-heading';
import { solicitarRecuperacaoSenha } from '../../services/mockApi';

const forgotPasswordSchema = z.object({
  identificador: z.string().min(1, 'Informe seu e-mail ou celular.'),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

const FORM_ID = 'forgot-password-form';

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [etapa, setEtapa] = useState<'form' | 'enviado'>('form');

  const {
    register,
    handleSubmit,
    getValues,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { identificador: '' },
  });

  const onSubmit = async ({ identificador }: ForgotPasswordFormValues) => {
    clearErrors('root');

    try {
      await solicitarRecuperacaoSenha({ identificador });
      setEtapa('enviado');
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : 'Não foi possível enviar o link.';
      setError('root', { message: mensagem });
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Header
        title="Recuperar senha"
        onBack={() => navigate('/login')}
        sticky
        bordered
        // `Header` ainda é `.jsx` sem tipos próprios — como `subtitle`/`meta`/
        // `actions` não têm valor padrão na desestruturação, o TypeScript os
        // infere como obrigatórios (mesmo sendo opcionais em tempo de
        // execução). Repassados como `undefined` só para satisfazer o tipo
        // inferido; some quando `Header` migrar para TS.
        subtitle={undefined}
        meta={undefined}
        actions={undefined}
      />

      {etapa === 'form' ? (
        <>
          <main className="flex-1 px-6 py-5">
            <IconHeading
              icon={KeyRound}
              iconTone="var(--color-primary)"
              title="Esqueci minha senha"
              description="Informe o e-mail ou celular do seu cadastro. Enviaremos um link para você criar uma senha nova."
              align="left"
            />

            <form id={FORM_ID} className="mt-6" onSubmit={handleSubmit(onSubmit)}>
              <Input
                label="E-mail ou celular"
                id="identificador"
                placeholder="voce@email.com ou (00) 00000-0000"
                error={errors.identificador?.message}
                {...register('identificador')}
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

          <footer className="sticky bottom-0 border-t border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] px-6 py-4 backdrop-blur-[8px]">
            <Button type="submit" form={FORM_ID} fullWidth iconRight={ChevronRight} loading={isSubmitting}>
              Enviar link
            </Button>
          </footer>
        </>
      ) : (
        <>
          <main className="flex-1 px-6 py-5">
            <IconHeading
              icon={MailCheck}
              iconTone="var(--color-primary)"
              title="Verifique seu e-mail ou SMS"
              description="Se esse cadastro existir, enviamos um link para redefinir a senha. Pode levar alguns minutos para chegar."
              align="center"
            />
            <p className="mt-2 text-center text-[12px] text-muted-foreground">
              Não recebeu? Verifique a caixa de spam ou tente novamente em alguns minutos.
            </p>
          </main>

          <footer className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] px-6 py-4 backdrop-blur-[8px]">
            <Button
              fullWidth
              variant="outline"
              onClick={() =>
                navigate('/recuperar-senha/nova', {
                  state: { identificador: getValues('identificador') },
                })
              }
            >
              Simular abertura do link (modo de teste)
            </Button>
            <Button fullWidth variant="ghost" onClick={() => navigate('/login')}>
              Voltar para o login
            </Button>
          </footer>
        </>
      )}
    </div>
  );
}
