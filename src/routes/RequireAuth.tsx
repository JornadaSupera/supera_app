import type { ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Lock, User } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import { useSignOut } from '../hooks/useAuth';
import { useNeedsLegalConsent } from '../hooks/useLegal';
import PendingRegistration from '../pages/Pending/PendingRegistration';
import Button from '../components/ui/button';
import Loading from '../components/ui/loading';
import EmptyState from '../components/ui/empty-state';
import ErrorState from '../components/ui/error-state';

// Guarda de rota. O estado da sessão vive na store, alimentada pelo
// `onAuthStateChange` do Supabase — ver `stores/sessionStore`.
//
// Autenticar não basta: o acesso ao conteúdo do app depende de a conta estar
// ativa E de existir um cadastro de paciente vinculado a ela. Os dois casos em
// que isso falha têm tela própria, e não uma lista vazia: sem vínculo, toda
// consulta clínica é negada pela RLS e devolve `[]` — o que na tela seria
// indistinguível de "você ainda não tem registros".
//
// O aceite da LGPD também mora aqui, não em `/onboarding` antes do Login: o
// banco fecha toda leitura/escrita para quem não está autenticado
// (`revoke_anon_access`, e `accept_legal_terms()` recusa `auth.uid()` nulo) —
// não tem como gravar consentimento antes de existir sessão. `/onboarding/lgpd`
// continua existindo como rota, só que agora como o primeiro desvio depois de
// "ativo e vinculado", igual aos outros dois estados abaixo.

interface RequireAuthProps {
  children: ReactNode;
  /** Só a própria rota `/onboarding/lgpd` usa isto — evita o loop de desviar
   * para si mesma. */
  skipConsentCheck?: boolean;
  /**
   * Área que pertence ao titular da conta: o acompanhante lê o conteúdo
   * clínico, mas não gerencia a conta (LGPD, exportação, exclusão) nem o
   * próprio vínculo.
   *
   * É conveniência de tela, não a barreira: quem recusa a ação de verdade é o
   * banco (as RPCs exigem o titular). O que esta guarda evita é o acompanhante
   * chegar a um formulário que só falharia na hora de enviar — o botão já some
   * do perfil, mas o endereço continuava aberto para quem o digitasse.
   */
  ownerOnly?: boolean;
}

export default function RequireAuth({
  children,
  skipConsentCheck = false,
  ownerOnly = false,
}: RequireAuthProps) {
  const navigate = useNavigate();
  const status = useSessionStore((state) => state.status);
  const isCaregiver = useSessionStore((state) => state.isCaregiver);
  const signOutMutation = useSignOut();

  const podeVerificarConsentimento = !skipConsentCheck && status === 'autenticado';
  const {
    needsConsent,
    isLoading: verificandoConsentimento,
    isError: consentCheckFailed,
    refetch: retryConsentCheck,
  } = useNeedsLegalConsent(podeVerificarConsentimento);

  if (status === 'verificando') {
    return <Loading />;
  }

  if (status === 'anonimo') {
    return <Navigate to="/login" replace />;
  }

  if (status === 'conta-inativa') {
    return (
      <EmptyState
        icon={Lock}
        iconTone="var(--color-destructive)"
        title="Acesso desativado"
        description="Seu acesso à Jornada Supera foi desativado. Fale com a recepção do Centro para reativá-lo."
        actionLabel="Sair"
        onAction={() => signOutMutation.mutate()}
      />
    );
  }

  // Sem vínculo não diz de quem é a conta: pode ser o paciente que acabou de
  // criá-la e espera a clínica concluir o cadastro pelo painel, ou um
  // acompanhante cujo vínculo acabou — os dois chegam aqui idênticos. Para o
  // acompanhante o texto fala da pessoa que ele acompanha; não há nada a
  // "verificar" do lado dele.
  //
  // O TEXTO NÃO AFIRMA QUE A CONTA NUNCA TEVE CADASTRO, porque o app não tem
  // como saber. `patients_select_own` é `id = my_own_patient_id()`, e essa
  // função exige a ficha E a conta ativas — então uma ficha desativada por
  // `set_patient_active(id, false)` fica invisível, exatamente igual a "ainda
  // não foi ligada". Por isso a recepção está no texto, ao lado da espera, em
  // vez de prometer o que não se sabe.
  if (status === 'sem-vinculo') {
    // O paciente tem tela própria: é a primeira que vê depois de se cadastrar,
    // e ela mesma confere se a recepção já concluiu o cadastro.
    if (!isCaregiver) return <PendingRegistration />;

    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-8">
        <EmptyState
          className="min-h-0"
          icon={User}
          title="Não encontramos um cadastro ligado a esta conta"
          description="Esta conta não está ligada a ninguém no momento. Fale com a pessoa que você acompanha ou com a recepção do Centro."
        />
        <div className="mt-2 flex w-full max-w-[320px] flex-col gap-2">
          <Button
            fullWidth
            variant="ghost"
            loading={signOutMutation.isPending}
            onClick={() => signOutMutation.mutate()}
          >
            Sair
          </Button>
        </div>
      </div>
    );
  }

  // Antes do aceite dos termos: a decisão só depende da sessão, e não faz
  // sentido mandar o acompanhante conferir consentimento para uma tela que ele
  // não pode abrir.
  if (ownerOnly && isCaregiver) {
    return (
      <EmptyState
        icon={Lock}
        title="Área do titular da conta"
        description="Esta tela é da pessoa que você acompanha. O resto do aplicativo continua disponível para você."
        actionLabel="Ir para o início"
        onAction={() => navigate('/home', { replace: true })}
      />
    );
  }

  if (podeVerificarConsentimento) {
    if (verificandoConsentimento) {
      return <Loading />;
    }
    // Trava de conformidade fecha na falha: se não deu para confirmar o
    // aceite dos termos, o conteúdo clínico não abre — "não sei" não vale
    // como "sim".
    if (consentCheckFailed) {
      return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-8">
          <ErrorState
            className="min-h-0"
            title="Não foi possível confirmar seus termos"
            description="Verifique sua conexão e tente novamente. Sem essa confirmação, o app não abre os seus dados."
            onRetry={retryConsentCheck}
          />
          <div className="mt-2 w-full max-w-[320px]">
            <Button
              fullWidth
              variant="ghost"
              loading={signOutMutation.isPending}
              onClick={() => signOutMutation.mutate()}
            >
              Sair
            </Button>
          </div>
        </div>
      );
    }
    if (needsConsent) {
      return <Navigate to="/onboarding/lgpd" replace />;
    }
    // Sem carregar e sem erro, `undefined` ainda é "não sei" — não libera.
    if (needsConsent === undefined) {
      return <Loading />;
    }
  }

  return children;
}
