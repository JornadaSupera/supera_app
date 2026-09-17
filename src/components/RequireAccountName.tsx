import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, UserRound } from 'lucide-react';
import Button from './ui/button';
import Input from './ui/input';
import { accountNameSchema, type AccountNameFormValues } from '../schemas/auth';
import { describeMutationError, useSignOut, useUpdateAccountName } from '../hooks/useAuth';
import { useSessionStore } from '../stores/sessionStore';

// Coleta o nome de quem entrou sem ele.
//
// Cadastro por e-mail exige o nome no formulário, então esta tela nunca aparece
// para ele. Ela existe pelo login federado: o trigger do banco lê uma única
// chave do metadata (`full_name`), e a Apple só manda o nome na PRIMEIRA
// autorização — muitas vezes nem aí, quando a pessoa usa "Ocultar meu e-mail".
// O Google costuma mandar, mas não é garantia. Nos dois casos a conta nasce com
// `accounts.full_name` nulo.
//
// Nome nulo é válido no banco de propósito (exigir no cadastro faria o signup
// inteiro falhar quando não viesse), e o guia aponta exatamente esta saída:
// coletar depois, com o `update` de `accounts`. É o que esta tela faz.
//
// Fica antes de qualquer rota porque o nome não é enfeite: é dele que a
// saudação da Home lê, e é por ele que a equipe identifica quem acompanha o
// paciente na ficha.

const FORM_ID = 'account-name-form';

export default function RequireAccountName({ children }: { children: ReactNode }) {
  const status = useSessionStore((state) => state.status);
  const fullName = useSessionStore((state) => state.fullName);
  const updateNameMutation = useUpdateAccountName();
  const signOutMutation = useSignOut();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AccountNameFormValues>({
    resolver: zodResolver(accountNameSchema),
    defaultValues: { fullName: '' },
  });

  // Só quem já autenticou. 'verificando' e 'anonimo' passam direto: a primeira
  // ainda não sabe quem é, e a segunda não tem conta para completar.
  const precisaDoNome =
    (status === 'autenticado' || status === 'sem-vinculo') && !fullName?.trim();

  if (!precisaDoNome) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background px-6 pt-[calc(3rem_+_var(--safe-top))] pb-8">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-primary">
        <UserRound size={22} strokeWidth={2} aria-hidden="true" />
      </span>

      <h1 className="text-[24px]/[1.25] font-semibold tracking-[-0.4px] text-foreground">
        Como podemos te chamar?
      </h1>
      <p className="mt-1 mb-6 text-[14px]/[1.5] text-muted-foreground">
        Seu login não trouxe o nome. Ele aparece nas suas telas e identifica você para a equipe do
        Centro.
      </p>

      <form
        id={FORM_ID}
        onSubmit={handleSubmit(({ fullName: nome }) => updateNameMutation.mutate(nome))}
      >
        <Input
          label="Nome completo"
          id="account-full-name"
          autoComplete="name"
          placeholder="Como está no seu documento"
          error={errors.fullName?.message}
          {...register('fullName')}
        />
      </form>

      {updateNameMutation.isError && (
        <p role="alert" className="mt-3 text-[12px]/[1.5] text-destructive">
          {describeMutationError(updateNameMutation.error, 'Não foi possível salvar seu nome.')}
        </p>
      )}

      <Button
        type="submit"
        form={FORM_ID}
        fullWidth
        className="mt-5"
        iconRight={ArrowRight}
        loading={updateNameMutation.isPending}
      >
        Continuar
      </Button>

      {/* Saída obrigatória: sem ela, uma falha teimosa na gravação prenderia a
          pessoa nesta tela sem nenhum caminho — nem para trás, nem para fora. */}
      <Button
        variant="ghost"
        size="sm"
        fullWidth
        className="mt-2"
        loading={signOutMutation.isPending}
        onClick={() => signOutMutation.mutate()}
      >
        Sair
      </Button>
    </div>
  );
}
