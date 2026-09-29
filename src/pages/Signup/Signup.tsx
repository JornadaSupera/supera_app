import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import FlowScreen from '../../components/ui/flow-screen';
import Button from '../../components/ui/button';
import SignupForm from './SignupForm';
import PhoneVerification from './PhoneVerification';
import ActivationScreen from '../Activation/ActivationScreen';
import { describeMutationError, useSignUp } from '../../hooks/useAuth';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import { useOpenLegalDocument } from '../../hooks/useLegal';
import { useToast } from '../../contexts/ToastContext';
import { useSessionStore } from '../../stores/sessionStore';
import { useSignupPrefillStore } from '../../stores/signupPrefillStore';
import { signupSchema, type SignupFormValues } from '../../schemas/signup';
import { toInternationalPhone } from '../../utils/phone';
import type { ActivationNotice, LegalDocumentKind } from '../../types';

type View = 'form' | 'confirm-email' | 'verify-phone' | 'activation';

const EMPTY_VALUES: SignupFormValues = {
  fullName: '',
  cpf: '',
  birthDate: '',
  phone: '',
  email: '',
  password: '',
  confirmPassword: '',
  acceptedTerms: false,
};

/**
 * Cadastro do paciente, numa tela só.
 *
 * O formulário guarda o que a pessoa digitou — em memória, e nunca em
 * armazenamento: CPF e nascimento não podem sobreviver ao aparelho. Sair da
 * tela descarta tudo.
 *
 * Quem chega pelo login já encontra o e-mail que digitou lá
 * (`signupPrefillStore`, também só em memória).
 *
 * Depois de criar a conta vem a confirmação do celular por SMS
 * (`PhoneVerification`), o primeiro acesso do contrato: código de 6 números,
 * reenvio depois de 60 segundos, e a conta se liga à ficha pelo celular, CPF e
 * nascimento — os dois ainda em memória, então não são pedidos de novo.
 *
 * O código de ativação da recepção (`ActivationScreen`) é a reserva: a pessoa
 * escolhe "Usar o código do Centro", ou a tela segue sozinha para ele quando a
 * confirmação é disputada por outra conta (`phone_contested`) ou o banco ainda
 * não liga a conta pelo celular. Quem não tem o código segue para a Home, que
 * mostra a tela de espera.
 */
export default function Signup() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const signUpMutation = useSignUp();
  const openDocument = useOpenLegalDocument();
  const goBack = useGoBackOr('/login');
  const [view, setView] = useState<View>('form');
  // Por que a tela do código de ativação veio depois do SMS (ela avisa).
  const [activationNotice, setActivationNotice] = useState<ActivationNotice | undefined>(undefined);

  // O e-mail vindo do login é lido uma vez, ao abrir, e apagado da memória logo
  // depois: dali em diante ele vive só no formulário.
  const [prefilledEmail] = useState(() => useSignupPrefillStore.getState().email ?? '');
  const clearPrefill = useSignupPrefillStore((state) => state.clear);
  useEffect(() => {
    clearPrefill();
  }, [clearPrefill]);

  // Como estava ao abrir: criar a conta muda o status no meio do fluxo (a
  // sessão nasce e a conta fica "sem vínculo"), e só quem já chegou logado é
  // desviado — quem chegou anônimo continua até o fim.
  const status = useSessionStore((state) => state.status);
  const [entryStatus] = useState(status);

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    mode: 'onTouched',
    defaultValues: { ...EMPTY_VALUES, email: prefilledEmail },
  });

  // Quem já está logado não cria conta: a Home mostra o que falta (cadastro
  // ainda sem vínculo, conta desativada) ou abre o app.
  if (entryStatus !== 'anonimo' && entryStatus !== 'verificando') {
    return <Navigate to="/home" replace />;
  }

  function handleOpenDocument(kind: LegalDocumentKind) {
    openDocument.mutate(kind, {
      onError: () =>
        showToast('Não foi possível abrir o documento. Tente de novo.', { variant: 'error' }),
    });
  }

  const submit = form.handleSubmit((values) => {
    signUpMutation.mutate(
      {
        fullName: values.fullName,
        email: values.email,
        password: values.password,
        phone: toInternationalPhone(values.phone),
      },
      {
        onSuccess: (result) => {
          // A conta existe: as senhas não têm mais o que fazer na memória — nem
          // no formulário, nem em `variables` da própria mutation.
          form.setValue('password', '');
          form.setValue('confirmPassword', '');
          signUpMutation.reset();

          if (result.needsEmailConfirmation) {
            setView('confirm-email');
            return;
          }

          // Um aviso só: o celular que não foi salvo na conta é o do perfil; o
          // SMS a seguir vai para o número digitado de qualquer jeito.
          showToast(
            result.phoneSaved
              ? 'Conta criada com sucesso.'
              : 'Conta criada, mas não conseguimos salvar seu celular agora.',
            { variant: result.phoneSaved ? 'success' : 'info' }
          );
          setView('verify-phone');
        },
      }
    );
  });

  if (view === 'confirm-email') {
    // Projeto com confirmação de e-mail ligada não devolve sessão no cadastro.
    // Seguir daqui só produziria erro de permissão — sem sessão não há conta a
    // ligar nem celular a verificar.
    return (
      <FlowScreen
        title="Confirme seu e-mail"
        subtitle="Enviamos um link de confirmação. Abra-o e entre com seu e-mail e senha."
        footer={
          <Button fullWidth onClick={() => navigate('/login', { replace: true })}>
            Ir para o login
          </Button>
        }
      />
    );
  }

  if (view === 'activation') {
    // A conta já existe: sem "voltar" (voltaria ao formulário de uma conta
    // criada). Quem ainda não tem o código segue para a tela de espera, e digita
    // depois — aí o CPF e o nascimento serão pedidos de novo, porque saem da
    // memória junto com esta tela.
    return (
      <ActivationScreen
        known={{ cpf: form.getValues('cpf'), birthDate: form.getValues('birthDate') }}
        notice={activationNotice}
        secondary={{
          label: 'Ainda não tenho o código',
          onClick: () => navigate('/home', { replace: true }),
        }}
        onActivated={() => navigate('/home', { replace: true })}
      />
    );
  }

  if (view === 'verify-phone') {
    return (
      <PhoneVerification
        phone={form.getValues('phone')}
        cpf={form.getValues('cpf')}
        birthDate={form.getValues('birthDate')}
        secondary={{ label: 'Usar o código do Centro', onClick: () => setView('activation') }}
        onUseActivationCode={(notice) => {
          setActivationNotice(notice);
          setView('activation');
        }}
      />
    );
  }

  return (
    <SignupForm
      form={form}
      onSubmit={submit}
      // O cadastro se abre a partir do login (o onboarding leva ao login):
      // voltar é voltar para lá.
      onBack={goBack}
      onSignIn={() => navigate('/login')}
      onOpenDocument={handleOpenDocument}
      isPending={signUpMutation.isPending}
      error={
        signUpMutation.isError
          ? describeMutationError(signUpMutation.error, 'Não foi possível criar a conta.')
          : null
      }
    />
  );
}
