import type { ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Lock, User } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import { useSignOut } from '../hooks/useAuth';
import { useNeedsLegalConsent } from '../hooks/useLegal';
import Button from '../components/ui/button';
import Loading from '../components/ui/loading';
import EmptyState from '../components/ui/empty-state';

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
  const { needsConsent, isLoading: verificandoConsentimento } = useNeedsLegalConsent(
    podeVerificarConsentimento
  );

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
  if (status === 'sem-vinculo') {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-8">
        <EmptyState
          className="min-h-0"
          icon={User}
          title="Cadastro ainda não vinculado"
          description={
            isCaregiver
              ? 'Esta conta não está ligada a ninguém no momento. Se você acompanha alguém, peça um novo convite a essa pessoa.'
              : 'Sua conta foi criada, mas ainda não está ligada a um cadastro. Se você é paciente do Centro, ative com o código que recebeu. Se foi convidado para acompanhar alguém, aceite o convite.'
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
    if (needsConsent) {
      return <Navigate to="/onboarding/lgpd" replace />;
    }
  }

  return children;
}
