import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, KeyRound, LogOut, ShieldCheck, UserRoundX } from 'lucide-react';
import StepHeader from '../../components/ui/step-header';
import Input from '../../components/ui/input';
import Button from '../../components/ui/button';
import Card from '../../components/ui/card';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import Loading from '../../components/ui/loading';
import AccountAuthPanel from '../Login/AccountAuthPanel';
import {
  describeMutationError,
  useActivatePatientAccount,
  useSignOut,
} from '../../hooks/useAuth';
import { patientActivationSchema, type PatientActivationFormValues } from '../../schemas/activation';
import { useSessionStore } from '../../stores/sessionStore';
import { useToast } from '../../contexts/ToastContext';
import { formatCPF } from '../../utils/masks';
import { maskedChangeHandler } from '../../utils/maskedInput';
import { todayInClinicTimeZone } from '../../utils/date';

// Ativação do app pelo paciente.
//
// Rota pública: quem chega aqui
// ainda não tem conta, ou tem conta sem ficha ligada — e `RequireAuth` barra
// os dois estados. Quem controla o acesso de verdade é a RPC, que exige
// sessão e confere código, CPF e nascimento contra a ficha.
//
// O código NÃO vem pela URL: ficaria no histórico do navegador e no
// cabeçalho `Referer`. A pessoa cola o código que recebeu.

const FORM_ID = 'patient-activation-form';

function ActivationLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <StepHeader onBack={() => navigate('/login')} meta="Ativação" />
      <main className="flex flex-1 flex-col p-6 pb-8">{children}</main>
    </div>
  );
}

/**
 * O rótulo é prop porque o botão serve a duas situações opostas, e prometer a
 * errada custa caro aqui: nas falhas da ativação a pessoa precisa voltar com
 * a MESMA conta, e um botão que diz "outra conta" a empurra a criar um
 * segundo e-mail — com o convite já consumido, só a clínica emite outro.
 */
function SignOutButton({ label }: { label: string }) {
  const signOutMutation = useSignOut();

  return (
    <Button
      variant="outline"
      size="sm"
      fullWidth
      iconLeft={LogOut}
      className="mt-4"
      loading={signOutMutation.isPending}
      onClick={() => signOutMutation.mutate()}
    >
      {label}
    </Button>
  );
}

function ActivationForm() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const activationMutation = useActivatePatientAccount();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<PatientActivationFormValues>({
    resolver: zodResolver(patientActivationSchema),
    mode: 'onTouched',
    defaultValues: { token: '', cpf: '', birthDate: '' },
  });

  const onSubmit = (values: PatientActivationFormValues) => {
    activationMutation.mutate(values, {
      onSuccess: () => {
        // A ativação deu certo no banco, mas a identidade não recarregou (rede
        // oscilou na releitura): seguir para a Home cairia de novo em "sem
        // vínculo". Entrar de novo resolve, e dizer isso é melhor que um loop.
        //
        // "com o mesmo e-mail" não é enfeite: o convite já foi consumido, e
        // quem cria uma segunda conta aqui não consegue mais ativar sozinho.
        if (useSessionStore.getState().status !== 'autenticado') {
          showToast(
            'Cadastro ativado. Não conseguimos carregar seus dados agora — saia e entre novamente com o mesmo e-mail.',
            { variant: 'info' }
          );
          return;
        }

        showToast('Cadastro ativado. Bem-vindo(a) à Jornada Supera!', { variant: 'success' });
        navigate('/home', { replace: true });
      },
    });
  };

  return (
    <section>
      <h2 className="mb-1 text-[16px] font-semibold text-foreground">Confirme seus dados</h2>
      <p className="mb-4 text-[13px]/[1.5] text-muted-foreground">
        Informe o código de ativação que você recebeu do Centro, o CPF e a data de nascimento do
        seu cadastro.
      </p>

      <form id={FORM_ID} className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
        <Input
          label="Código de ativação"
          id="activation-token"
          // O código é de uso único: não deve ser guardado nem sugerido pelo
          // navegador, e o teclado do celular não pode capitalizá-lo.
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Cole aqui o código recebido"
          error={errors.token?.message}
          {...register('token')}
        />
        <Input
          label="CPF"
          id="activation-cpf"
          inputMode="numeric"
          autoComplete="off"
          placeholder="000.000.000-00"
          maxLength={14}
          error={errors.cpf?.message}
          // Corrigir um dígito no meio do CPF é o caso comum aqui, e a recusa
          // do banco é a mesma para código, CPF e nascimento errados — se a
          // máscara embaralhar o campo, a pessoa não tem como saber que foi
          // ele. Por isso o cursor é preservado.
          {...register('cpf', {
            onChange: maskedChangeHandler(formatCPF, (masked) => setValue('cpf', masked)),
          })}
        />
        <Input
          label="Data de nascimento"
          id="activation-birth-date"
          type="date"
          autoComplete="bday"
          max={todayInClinicTimeZone()}
          error={errors.birthDate?.message}
          {...register('birthDate')}
        />
      </form>

      {activationMutation.isError && (
        <p role="alert" className="mt-3 text-[12px]/[1.5] text-destructive">
          {describeMutationError(activationMutation.error, 'Não foi possível ativar seu cadastro.')}
        </p>
      )}

      <Button
        type="submit"
        form={FORM_ID}
        fullWidth
        className="mt-5"
        iconRight={ArrowRight}
        loading={activationMutation.isPending}
        disabled={activationMutation.isPending}
      >
        Ativar cadastro
      </Button>
    </section>
  );
}

export default function PatientActivation() {
  const navigate = useNavigate();
  const status = useSessionStore((state) => state.status);
  const isCaregiver = useSessionStore((state) => state.isCaregiver);

  if (status === 'verificando') {
    return <Loading />;
  }

  // "Tentar novamente" não resolve conta desativada — só a clínica reativa.
  // A saída que falta é sair da conta, para entrar com outra.
  if (status === 'conta-inativa') {
    return (
      <ActivationLayout>
        <ErrorState
          className="flex-1"
          title="Acesso desativado"
          description="Sua conta está desativada e não pode ativar o app. Fale com a recepção do Centro."
        />
        <SignOutButton label="Sair desta conta" />
      </ActivationLayout>
    );
  }

  // Conta de acompanhante (ativo ou com vínculo encerrado): o banco não deixa
  // uma conta com outro perfil ativar o app como paciente. Dizer isso antes
  // poupa a pessoa de preencher tudo para receber a recusa no fim.
  if (status !== 'anonimo' && isCaregiver) {
    return (
      <ActivationLayout>
        <EmptyState
          className="min-h-0 flex-1"
          icon={UserRoundX}
          title="Esta conta é de acompanhante"
          description="Para ativar o app como paciente, use uma conta própria, com outro e-mail."
        />
        <SignOutButton label="Entrar com outra conta" />
      </ActivationLayout>
    );
  }

  if (status === 'autenticado') {
    return (
      <ActivationLayout>
        <EmptyState
          className="min-h-0 flex-1"
          icon={ShieldCheck}
          iconTone="var(--color-supera-empatia)"
          title="Seu cadastro já está ativo"
          description="Esta conta já está ligada ao seu cadastro de paciente."
          actionLabel="Ir para o início"
          onAction={() => navigate('/home', { replace: true })}
        />
      </ActivationLayout>
    );
  }

  const identified = status === 'sem-vinculo';

  return (
    <ActivationLayout>
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-primary">
        <KeyRound size={22} strokeWidth={2} aria-hidden="true" />
      </span>

      <h1 className="text-[24px]/[1.25] font-semibold tracking-[-0.4px] text-foreground">
        Ativar meu cadastro
      </h1>
      <p className="mt-1 mb-6 text-[14px]/[1.5] text-muted-foreground">
        O Centro já fez o seu cadastro. Aqui você liga a sua conta a ele para acompanhar o
        tratamento pelo app.
      </p>

      {identified ? (
        <ActivationForm />
      ) : (
        <AccountAuthPanel
          idPrefix="activation"
          intro="Crie a conta que você vai usar para entrar no app — ou entre, se já tiver uma."
          emailConfirmationMessage="Enviamos um link de confirmação. Abra-o, entre com seu e-mail e senha e volte a esta tela para informar o código de ativação — ele continua valendo até a data de validade."
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
            <p className="text-[13px] font-medium text-foreground">Por que pedimos esses dados</p>
            <p className="mt-1 text-[12px]/[1.5] text-muted-foreground">
              O CPF e a data de nascimento confirmam que o código está sendo usado por você. Eles
              não ficam guardados neste aparelho.
            </p>
            <p className="mt-2 text-[12px]/[1.5] text-muted-foreground">
              Não recebeu o código, ou ele venceu? Fale com a recepção do Centro — só a clínica
              pode enviar um novo.
            </p>
          </div>
        </div>
      </Card>

      {/* Neutro de propósito: daqui saem tanto quem errou de conta quanto quem
          precisa voltar com a mesma. O texto que acompanha cada recusa é que
          diz qual dos dois é o caso. */}
      {identified && <SignOutButton label="Sair desta conta" />}
    </ActivationLayout>
  );
}
