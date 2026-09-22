import type { ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Lock, User } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import { useSignOut } from '../hooks/useAuth';
import { useNeedsLegalConsent } from '../hooks/useLegal';
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
}

export default function RequireAuth({ children, skipConsentCheck = false }: RequireAuthProps) {
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

  // Sem vínculo não diz de quem é a conta: pode ser o paciente antes de
  // ativar, ou alguém convidado como acompanhante antes de aceitar — os dois
  // chegam aqui idênticos. Por isso a tela oferece os dois caminhos. A
  // exceção é a conta que já foi de acompanhante (`isCaregiver`): o banco não
  // a deixa ativar como paciente, então esse caminho nem aparece.
  //
  // O TEXTO NÃO AFIRMA QUE A CONTA NÃO TEM CADASTRO, porque o app não tem como
  // saber. `patients_select_own` é `id = my_own_patient_id()`, e essa função
  // exige a ficha E a conta ativas — então uma ficha desativada por
  // `set_patient_active(id, false)` fica invisível, exatamente igual a "nunca
  // houve ficha". Quem cai aqui nesse estado já está ligado, e mandá-lo ativar
  // devolve `account_already_linked` para sempre: o convite não resolve, só a
  // clínica reativando a ficha. Daí o caminho para a recepção estar no texto,
  // ao lado dos outros dois, em vez de prometer o que não se sabe.
  if (status === 'sem-vinculo') {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-8">
        <EmptyState
          className="min-h-0"
          icon={User}
          title="Não encontramos um cadastro ligado a esta conta"
          description={
            isCaregiver
              ? 'Esta conta não está ligada a ninguém no momento. Se você acompanha alguém, peça um novo convite a essa pessoa.'
              : 'Se você é paciente do Centro e recebeu um código, ative seu cadastro. Se foi convidado para acompanhar alguém, aceite o convite. Se já usava o app normalmente e seus dados sumiram, fale com a recepção do Centro — só ela pode reativar um cadastro.'
          }
        />
        <div className="mt-2 flex w-full max-w-[320px] flex-col gap-2">
          {!isCaregiver && (
            <Button fullWidth onClick={() => navigate('/ativar')}>
              Ativar meu cadastro
            </Button>
          )}
          <Button fullWidth variant="outline" onClick={() => navigate('/cuidador/aceitar')}>
            Aceitar convite de acompanhante
          </Button>
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
