import { useState, type ComponentType } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Lock, ShieldCheck, UserRoundX } from 'lucide-react';
import Button from '../../components/ui/button';
import EmptyState from '../../components/ui/empty-state';
import Loading from '../../components/ui/loading';
import PhoneConfirmationForm from './PhoneConfirmationForm';
import PhoneVerification from '../Signup/PhoneVerification';
import {
  describeMutationError,
  useConfirmedPhone,
  useLinkPatientByVerifiedPhone,
  useSignOut,
} from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';
import { useSessionStore } from '../../stores/sessionStore';
import { AppError } from '../../lib/appError';
import { toInternationalPhone } from '../../utils/phone';
import type { PhoneConfirmationFormValues } from '../../schemas/signup';

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>;

/** Dados (CPF, nascimento e celular) → código do SMS. */
type ConfirmView = 'phone-form' | 'phone-code';

interface NoticeProps {
  icon: IconComponent;
  iconTone?: string;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  loading?: boolean;
}

/**
 * Aviso de tela cheia, com uma única saída. Ela é a ação principal do aviso,
 * o mesmo botão primário que a `EmptyState` desenha nas outras telas de aviso,
 * e à mesma distância da frase: 20 px (os 12 do `gap` dela mais 8). O `pb-0`
 * tira o respiro de baixo da `EmptyState`, que afastava o botão para 40 px.
 * Fica fora dela por causa do `loading`.
 */
function Notice({ icon, iconTone, title, description, actionLabel, onAction, loading }: NoticeProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-safe-8">
      <EmptyState
        className="min-h-0 pb-0"
        icon={icon}
        iconTone={iconTone}
        title={title}
        description={description}
      />
      <div className="mt-5 w-full max-w-[320px]">
        <Button fullWidth loading={loading} onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * Confirmar o cadastro (`/confirmar-cadastro`), para quem tem conta e ainda não
 * tem ficha ligada: entrou pelo Google/Apple, criou a conta e saiu antes de
 * confirmar, ou errou CPF ou nascimento. O caminho é o do contrato — CPF,
 * nascimento e celular, e o código por SMS —, e desde 29/09 é o único: o código
 * de ativação do Centro saiu do app. CPF e nascimento não estão mais na
 * memória, então esta tela os pede de novo.
 *
 * Quem já confirmou aquele celular liga direto, sem SMS: para o mesmo número o
 * Auth não manda código nenhum, e a pessoa ficaria esperando um SMS que não vem.
 *
 * Fica fora de `RequireAuth` (que barra justamente o estado "sem vínculo"),
 * então trata cada estado da sessão aqui. Quem controla o acesso de verdade é
 * a RPC, que exige sessão e o celular confirmado, e confere CPF e nascimento
 * contra a ficha.
 *
 * A ligação vira a sessão para "autenticado" ANTES de o `onSuccess` rodar (é a
 * releitura da identidade que a vira). Se a tela trocasse por "cadastro já
 * confirmado" nesse instante, ela seria desmontada e o aviso de sucesso e a ida
 * para a Home se perderiam. Por isso, quem chegou aqui sem vínculo continua
 * vendo o fluxo até ele terminar.
 */
export default function ConfirmRegistration() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const status = useSessionStore((state) => state.status);
  const isCaregiver = useSessionStore((state) => state.isCaregiver);
  const signOutMutation = useSignOut();
  const confirmedPhone = useConfirmedPhone();
  const link = useLinkPatientByVerifiedPhone();
  const [arrivedUnlinked, setArrivedUnlinked] = useState(status === 'unlinked');
  const [view, setView] = useState<ConfirmView>('phone-form');
  // Só em memória: some junto com a tela.
  const [identity, setIdentity] = useState<PhoneConfirmationFormValues | null>(null);

  // "Ajustar estado durante a renderização": o app pode abrir direto nesta rota
  // ainda em 'checking', e só depois resolver para 'unlinked'.
  if (status === 'unlinked' && !arrivedUnlinked) {
    setArrivedUnlinked(true);
  }

  const signOut = () => signOutMutation.mutate();
  const signOutAction = { label: 'Sair desta conta', onClick: signOut, loading: signOutMutation.isPending };

  function handleSubmit(values: PhoneConfirmationFormValues) {
    setIdentity(values);
    link.reset();

    if (confirmedPhone.data && confirmedPhone.data === toInternationalPhone(values.phone)) {
      link.mutate(
        { cpf: values.cpf, birthDate: values.birthDate },
        {
          onSuccess: () => {
            showToast('Cadastro confirmado. Bem-vindo(a) à Jornada Supera!', { variant: 'success' });
            navigate('/home', { replace: true });
          },
          // O banco não reconhece mais a confirmação: o caminho é um código novo.
          onError: (error) => {
            if (error instanceof AppError && error.code === 'phone_not_verified') setView('phone-code');
          },
        }
      );
      return;
    }

    setView('phone-code');
  }

  if (status === 'checking') {
    return <Loading />;
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace />;
  }

  // "Tentar de novo" não resolve conta desativada — só a recepção reativa.
  if (status === 'inactive') {
    return (
      <Notice
        icon={Lock}
        title="Acesso desativado"
        description="Sua conta está desativada e não pode confirmar o cadastro. Fale com a recepção do Centro."
        actionLabel="Sair desta conta"
        onAction={signOut}
        loading={signOutMutation.isPending}
      />
    );
  }

  // O banco não deixa uma conta com outro perfil virar de paciente. Dizer isso
  // antes poupa a pessoa de preencher tudo para receber a recusa no fim.
  if (isCaregiver) {
    return (
      <Notice
        icon={UserRoundX}
        title="Esta conta é de acompanhante"
        description="Para confirmar o cadastro como paciente, use uma conta própria, com outro e-mail."
        actionLabel="Entrar com outra conta"
        onAction={signOut}
        loading={signOutMutation.isPending}
      />
    );
  }

  if (status === 'authenticated' && !arrivedUnlinked) {
    return (
      <Notice
        icon={ShieldCheck}
        iconTone="var(--color-primary-deep)"
        title="Seu cadastro já está confirmado"
        description="Esta conta já está ligada ao seu cadastro de paciente."
        actionLabel="Ir para o início"
        onAction={() => navigate('/home', { replace: true })}
      />
    );
  }

  if (view === 'phone-code' && identity) {
    return (
      <PhoneVerification
        phone={identity.phone}
        cpf={identity.cpf}
        birthDate={identity.birthDate}
        // Voltar (ou "Corrigir dados") devolve ao formulário, preenchido.
        onBack={() => setView('phone-form')}
        onCorrectData={() => setView('phone-form')}
        secondary={signOutAction}
      />
    );
  }

  const linkRefusedHere =
    link.isError && !(link.error instanceof AppError && link.error.code === 'phone_not_verified');

  return (
    <PhoneConfirmationForm
      defaultValues={identity ?? undefined}
      onBack={() => navigate('/home')}
      onSubmit={handleSubmit}
      isPending={link.isPending}
      error={linkRefusedHere ? describeMutationError(link.error, 'Não foi possível confirmar seu cadastro.') : null}
      secondary={signOutAction}
    />
  );
}
