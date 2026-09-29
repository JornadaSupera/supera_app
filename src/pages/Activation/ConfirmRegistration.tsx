import { useState, type ComponentType } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Lock, ShieldCheck, UserRoundX } from 'lucide-react';
import Button from '../../components/ui/button';
import EmptyState from '../../components/ui/empty-state';
import Loading from '../../components/ui/loading';
import ActivationScreen from './ActivationScreen';
import PhoneConfirmationForm from './PhoneConfirmationForm';
import PhoneVerification from '../Signup/PhoneVerification';
import { useSignOut } from '../../hooks/useAuth';
import { useSessionStore } from '../../stores/sessionStore';
import type { PhoneConfirmationFormValues } from '../../schemas/signup';
import type { ActivationNotice } from '../../types';

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>;

/** Dados → código do SMS → (reserva) código de ativação do Centro. */
type ConfirmView = 'phone-form' | 'phone-code' | 'activation';

interface NoticeProps {
  icon: IconComponent;
  iconTone?: string;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  loading?: boolean;
}

/** Aviso de tela cheia, com uma única saída. */
function Notice({ icon, iconTone, title, description, actionLabel, onAction, loading }: NoticeProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-8">
      <EmptyState
        className="min-h-0"
        icon={icon}
        iconTone={iconTone}
        title={title}
        description={description}
      />
      <div className="mt-2 w-full max-w-[320px]">
        <Button fullWidth variant="ghost" loading={loading} onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * Confirmar o cadastro (`/confirmar-cadastro`), para quem tem conta e ainda não
 * tem ficha ligada: entrou pelo Google/Apple, ou criou a conta e saiu antes de
 * confirmar. O caminho é o do contrato — CPF, nascimento e celular, e o código
 * por SMS —, com o código de ativação da recepção como reserva. CPF e
 * nascimento não estão mais na memória, então esta tela os pede de novo.
 *
 * Fica fora de `RequireAuth` (que barra justamente o estado "sem vínculo"),
 * então trata cada estado da sessão aqui. Quem controla o acesso de verdade é
 * a RPC, que exige sessão e confere código, CPF e nascimento contra a ficha.
 *
 * A confirmação vira a sessão para "autenticado" ANTES de o `onSuccess` da
 * tela do código rodar (é a releitura da identidade que a vira). Se a tela
 * trocasse por "cadastro já confirmado" nesse instante, ela seria desmontada e
 * o aviso de sucesso e a ida para a Home se perderiam. Por isso, quem chegou
 * aqui sem vínculo continua vendo a tela do código até ela terminar.
 */
export default function ConfirmRegistration() {
  const navigate = useNavigate();
  const status = useSessionStore((state) => state.status);
  const isCaregiver = useSessionStore((state) => state.isCaregiver);
  const signOutMutation = useSignOut();
  const [arrivedUnlinked, setArrivedUnlinked] = useState(status === 'sem-vinculo');
  const [view, setView] = useState<ConfirmView>('phone-form');
  // Só em memória: some junto com a tela.
  const [identity, setIdentity] = useState<PhoneConfirmationFormValues | null>(null);
  // Por que a tela do código de ativação veio depois do SMS (ela avisa).
  const [activationNotice, setActivationNotice] = useState<ActivationNotice | undefined>(undefined);

  // "Ajustar estado durante a renderização": o app pode abrir direto nesta rota
  // ainda em 'verificando', e só depois resolver para 'sem-vinculo'.
  if (status === 'sem-vinculo' && !arrivedUnlinked) {
    setArrivedUnlinked(true);
  }

  const signOut = () => signOutMutation.mutate();

  if (status === 'verificando') {
    return <Loading />;
  }

  if (status === 'anonimo') {
    return <Navigate to="/login" replace />;
  }

  // "Tentar de novo" não resolve conta desativada — só a recepção reativa.
  if (status === 'conta-inativa') {
    return (
      <Notice
        icon={Lock}
        iconTone="var(--color-destructive)"
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

  if (status === 'autenticado' && !arrivedUnlinked) {
    return (
      <Notice
        icon={ShieldCheck}
        iconTone="var(--color-supera-empatia)"
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
        // Voltar para corrigir o número: os dados continuam preenchidos.
        onBack={() => setView('phone-form')}
        secondary={{ label: 'Usar o código do Centro', onClick: () => setView('activation') }}
        onUseActivationCode={(notice) => {
          setActivationNotice(notice);
          setView('activation');
        }}
      />
    );
  }

  if (view === 'activation') {
    return (
      <ActivationScreen
        // Vindo do SMS, CPF e nascimento já foram digitados: só falta o código.
        known={identity ? { cpf: identity.cpf, birthDate: identity.birthDate } : undefined}
        notice={activationNotice}
        onBack={() => {
          setActivationNotice(undefined);
          setView('phone-form');
        }}
        secondary={{
          label: 'Sair desta conta',
          onClick: signOut,
          loading: signOutMutation.isPending,
        }}
        onActivated={() => navigate('/home', { replace: true })}
      />
    );
  }

  return (
    <PhoneConfirmationForm
      defaultValues={identity ?? undefined}
      onBack={() => navigate('/home')}
      onSubmit={(values) => {
        setIdentity(values);
        setView('phone-code');
      }}
      secondary={{ label: 'Tenho o código do Centro', onClick: () => setView('activation') }}
    />
  );
}
