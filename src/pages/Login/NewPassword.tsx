import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { ChevronRight } from 'lucide-react';
import Button from '../../components/ui/button';
import Input from '../../components/ui/input';
import Header from '../../components/ui/header';
import PasswordStrengthMeter from '../../components/ui/password-strength-meter';
import { useToast } from '../../contexts/ToastContext';
import { redefinirSenha } from '../../services/mockApi';

const newPasswordSchema = z
  .object({
    senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.'),
    confirmarSenha: z.string().min(1, 'Confirme sua nova senha.'),
  })
  .refine((data) => data.senha === data.confirmarSenha, {
    message: 'As senhas não coincidem.',
    path: ['confirmarSenha'],
  });

type NewPasswordFormValues = z.infer<typeof newPasswordSchema>;

/** Forma do `location.state` recebido de `ForgotPassword` ao simular a abertura do link. */
interface RecoverPasswordLocationState {
  identificador?: string;
}

const FORM_ID = 'new-password-form';

export default function NewPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting, isValid },
  } = useForm<NewPasswordFormValues>({
    resolver: zodResolver(newPasswordSchema),
    mode: 'onChange',
    defaultValues: { senha: '', confirmarSenha: '' },
  });

  const senha = watch('senha');
  const confirmarSenha = watch('confirmarSenha');

  const identificador = (location.state as RecoverPasswordLocationState | null)?.identificador;

  // Guarda de rota: só permite acesso vindo da tela de recuperação de senha,
  // que envia o identificador via state do react-router. Todos os hooks
  // acima precisam ser chamados antes deste retorno condicional.
  if (!identificador) {
    return <Navigate to="/recuperar-senha" replace />;
  }

  const onSubmit = async ({ senha: novaSenha }: NewPasswordFormValues) => {
    try {
      await redefinirSenha({ senha: novaSenha });
      showToast('Senha redefinida com sucesso. Faça login com sua nova senha.', { variant: 'success' });
      navigate('/login', { replace: true });
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : 'Não foi possível redefinir sua senha.';
      showToast(mensagem, { variant: 'error' });
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Header
        title="Nova senha"
        onBack={() => navigate('/recuperar-senha')}
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

      <main className="flex-1 px-6 pb-6">
        <p className="pt-2 text-[14px] text-muted-foreground">
          Crie uma senha nova para sua conta. Use uma senha que você lembre — mas que ninguém adivinhe.
        </p>

        <form id={FORM_ID} className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <Input
              label="Nova senha"
              id="senha"
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo de 8 caracteres"
              {...register('senha')}
            />
            <div className="mt-2">
              <PasswordStrengthMeter password={senha} />
            </div>
          </div>

          <Input
            label="Confirmar nova senha"
            id="confirma"
            type="password"
            autoComplete="new-password"
            placeholder="Repita a senha"
            error={confirmarSenha ? errors.confirmarSenha?.message : undefined}
            {...register('confirmarSenha')}
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
