import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { HeartHandshake, ShieldCheck, LogOut, UserRoundX } from 'lucide-react';
import StepHeader from '../../components/ui/step-header';
import Input from '../../components/ui/input';
import Button from '../../components/ui/button';
import Card from '../../components/ui/card';
import Loading from '../../components/ui/loading';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import AccountAuthPanel from '../Login/AccountAuthPanel';
import { acceptInvitationSchema } from '../../schemas/caregiver';
import type { AcceptInvitationFormValues } from '../../schemas/caregiver';
import { useAcceptCaregiverInvitation } from '../../hooks/useCaregiver';
import { describeMutationError, useSignOut } from '../../hooks/useAuth';
import { useSessionStore } from '../../stores/sessionStore';
import { useToast } from '../../contexts/ToastContext';

// Tela de aceite do convite de acompanhante.
//
// Rota pública de propósito: quem chega aqui quase sempre ainda não tem conta,
// e `RequireAuth` a barraria duas vezes — por não ter sessão e, depois do
// cadastro, por não ter vínculo de paciente (que é justamente o que esta tela
// existe para criar). O controle de acesso real é da RPC, que exige
// `auth.uid()` e valida o token contra o hash guardado.
//
// O código NÃO vem pela URL. Um `?token=` vazaria no histórico do navegador,
// no cabeçalho `Referer` e em qualquer log de proxy no caminho — e o convite
// não expira, então o vazamento seria permanente. A pessoa cola o código, que
// é como ela o recebeu.

const FORM_ID = 'accept-invitation-form';

function AcceptInvitationForm() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const aceitarMutation = useAcceptCaregiverInvitation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AcceptInvitationFormValues>({
    resolver: zodResolver(acceptInvitationSchema),
    mode: 'onTouched',
    defaultValues: { token: '' },
  });

  return (
    <section>
      <h2 className="mb-1 text-[16px] font-semibold text-foreground">Informe o código</h2>
      <p className="mb-4 text-[13px]/[1.5] text-muted-foreground">
        Cole o código que a pessoa que você vai acompanhar enviou para você.
      </p>

      <form
        id={FORM_ID}
        onSubmit={handleSubmit(({ token }) =>
          aceitarMutation.mutate(token, {
            onSuccess: () => {
              showToast('Vínculo criado. Você já pode acompanhar.', { variant: 'success' });
              navigate('/home', { replace: true });
            },
          })
        )}
      >
        <Input
          label="Código do convite"
          id="convite-token"
          // `off` nos três: o código é de uso único e não deve ser guardado
          // pelo navegador nem sugerido depois.
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Cole aqui o código recebido"
          error={errors.token?.message}
          {...register('token')}
        />
      </form>

      {aceitarMutation.isError && (
        <p role="alert" className="mt-3 text-[12px] text-destructive">
          {describeMutationError(aceitarMutation.error, 'Não foi possível aceitar o convite.')}
        </p>
      )}

      <Button
        type="submit"
        form={FORM_ID}
        fullWidth
        className="mt-5"
        loading={aceitarMutation.isPending}
      >
        Aceitar convite
      </Button>
    </section>
  );
}

export default function AcceptInvitation() {
  const navigate = useNavigate();
  const status = useSessionStore((state) => state.status);
  const isCaregiver = useSessionStore((state) => state.isCaregiver);
  const signOutMutation = useSignOut();

  if (status === 'verificando') {
    return <Loading />;
  }

  // Rota pública: `RequireAuth` não entra aqui, então a tela de conta
  // desativada precisa trazer a própria saída — no iOS não há "voltar" do
  // sistema, e sem cabeçalho nem "Sair" a pessoa ficava presa.
  if (status === 'conta-inativa') {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <StepHeader onBack={() => navigate('/login')} meta="Convite" />
        <main className="flex flex-1 flex-col p-6 pb-8">
          <ErrorState
            className="flex-1"
            title="Acesso desativado"
            description="Sua conta está desativada e não pode aceitar convites. Fale com a recepção do Centro."
          />
          <Button
            variant="outline"
            size="sm"
            fullWidth
            iconLeft={LogOut}
            className="mt-4"
            loading={signOutMutation.isPending}
            onClick={() => signOutMutation.mutate()}
          >
            Sair desta conta
          </Button>
        </main>
      </div>
    );
  }

  // Conta que já é paciente não segue por aqui, e o motivo não é cosmético.
  //
  // O banco ACEITARIA: `accept_caregiver_invitation` só barra o autovínculo,
  // então o titular pode virar acompanhante de outro paciente. Só que aí a
  // conta passa a enxergar duas fichas — a própria e a tutelada — e cada
  // escrita teria de decidir de quem é. A sessão resolve isso dando precedência
  // à ficha própria (ver `getSessionIdentity`), o que tornaria o vínculo de
  // acompanhante inalcançável: a pessoa aceitaria o convite e não veria nada.
  //
  // Melhor recusar antes, dizendo o porquê, do que gastar o convite — ele é de
  // uso único, e queimá-lo obrigaria o titular a emitir outro.
  const contaEhPaciente = status === 'autenticado' && !isCaregiver;

  if (contaEhPaciente) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <StepHeader onBack={() => navigate('/login')} meta="Convite" />
        <main className="flex flex-1 flex-col p-6 pb-8">
          <EmptyState
            className="min-h-0 flex-1"
            icon={UserRoundX}
            title="Esta conta é de paciente"
            description="Ela está ligada ao seu próprio cadastro no Centro. Para acompanhar outra pessoa, use uma conta separada, com outro e-mail."
          />
          <Button
            variant="outline"
            size="sm"
            fullWidth
            iconLeft={LogOut}
            className="mt-4"
            loading={signOutMutation.isPending}
            onClick={() => signOutMutation.mutate()}
          >
            Entrar com outra conta
          </Button>
        </main>
      </div>
    );
  }

  // `sem-vinculo` é o estado normal de quem acabou de criar conta e ainda não
  // aceitou nada; `autenticado` aqui só sobra para quem já acompanha alguém e
  // recebeu convite de mais uma pessoa.
  const identificado = status === 'autenticado' || status === 'sem-vinculo';

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <StepHeader onBack={() => navigate('/login')} meta="Convite" />

      <main className="flex-1 p-6 pb-8">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--color-supera-empatia)_15%,transparent)] text-[var(--color-supera-empatia)]">
          <HeartHandshake size={22} strokeWidth={2} aria-hidden="true" />
        </span>

        <h1 className="text-[24px]/[1.25] font-semibold tracking-[-0.4px] text-foreground">
          Aceitar convite de acompanhante
        </h1>
        <p className="mt-1 mb-6 text-[14px]/[1.5] text-muted-foreground">
          Alguém em tratamento no Centro convidou você para acompanhar a jornada dela.
        </p>

        {identificado ? (
          <AcceptInvitationForm />
        ) : (
          <AccountAuthPanel
            idPrefix="caregiver"
            intro={
              <>
                Você vai acompanhar com <strong>o seu próprio login</strong> — nunca com a senha da
                pessoa que te convidou.
              </>
            }
            emailConfirmationMessage="Enviamos um link de confirmação. Depois de confirmar, volte ao app, entre em “Já tenho conta” e informe o código do convite — ele continua valendo."
          />
        )}

        <Card variant="default" elevation="none" padding="md" className="mt-6">
          <div className="flex items-start gap-2">
            <ShieldCheck
              size={16}
              strokeWidth={2}
              className="mt-[1px] shrink-0 text-[var(--color-supera-uniao)]"
              aria-hidden="true"
            />
            <div>
              <p className="text-[13px] font-medium text-foreground">O que você poderá acessar</p>
              <p className="mt-1 text-[12px]/[1.5] text-muted-foreground">
                Agenda, lembretes, orientações, chat com a equipe e o diário de sintomas de quem
                convidou você. Conteúdo sigiloso — como sessões de psicologia — permanece fora do
                seu alcance, e você não gerencia a conta nem o vínculo dela.
              </p>
              <p className="mt-2 text-[12px]/[1.5] text-muted-foreground">
                A pessoa pode encerrar o seu acesso a qualquer momento, e isso vale na hora. Suas
                ações ficam registradas na auditoria.
              </p>
            </div>
          </div>
        </Card>

        {identificado && (
          <Button
            variant="outline"
            size="sm"
            fullWidth
            iconLeft={LogOut}
            className="mt-4"
            loading={signOutMutation.isPending}
            onClick={() => signOutMutation.mutate()}
          >
            Entrar com outra conta
          </Button>
        )}
      </main>
    </div>
  );
}
