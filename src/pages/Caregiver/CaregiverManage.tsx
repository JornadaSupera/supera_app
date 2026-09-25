import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Ban, MessageCircle, Plus, Smartphone, Users } from 'lucide-react';
import FlowScreen from '../../components/ui/flow-screen';
import Button from '../../components/ui/button';
import ConfirmDialog from '../../components/ui/confirm-dialog';
import Modal from '../../components/ui/modal';
import ErrorState from '../../components/ui/error-state';
import InlineError from '../../components/ui/inline-error';
import Skeleton from '../../components/ui/skeleton';
import CaregiverCard from './CaregiverCard';
import LinkHistory from './LinkHistory';
import DemoNotice from './DemoNotice';
import ScopePanel from './ScopePanel';
import { handoffFromAccess, handoffFromSmsFailure, type HandoffBase } from './handoff';
import {
  useCaregiverLinks,
  useMyCaregiver,
  useResetCaregiverPassword,
  useRevokeCaregiver,
} from '../../hooks/useCaregiver';
import { describeMutationError } from '../../hooks/useAuth';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import { useToast } from '../../contexts/ToastContext';
import { useCaregiverHandoffStore } from '../../stores/caregiverHandoffStore';
import { CAREGIVER_DEMO_HINT } from '../../lib/features';
import { getCaregiverErrorCode } from '../../lib/caregiverError';
import { firstName } from '../../utils/caregiverMessage';
import type { CaregiverDelivery, MyCaregiver } from '../../types';

/** Carregamento com a forma da tela: o cartão do acompanhante e o painel de escopo. */
function ManageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando seu acompanhante">
      <Skeleton className="h-64 w-full rounded-2xl" />
      <Skeleton className="h-52 w-full rounded-2xl" />
    </div>
  );
}

/**
 * O texto do erro de leitura. Em desenvolvimento, quando as funções do banco
 * ainda não existem, soma como ver o fluxo com a demonstração.
 */
function describeLoadError(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : undefined;
  if (CAREGIVER_DEMO_HINT && getCaregiverErrorCode(error) === 'unavailable') {
    return `${message ?? ''} ${CAREGIVER_DEMO_HINT}`.trim();
  }
  return message;
}

/** Do acompanhante lido ao que a tela de envio guarda (celular já em E.164, como o banco o devolve). */
function toHandoffBase(caregiver: MyCaregiver): HandoffBase {
  return { fullName: caregiver.fullName, email: caregiver.email, phone: caregiver.phone };
}

/**
 * Meu acompanhante: o cartão de quem está vinculado (ou o convite a adicionar
 * um), o que ele pode e não pode, e o histórico de vínculos.
 *
 * O acompanhante nasce direto na conta do titular, com senha provisória — não
 * há convite. Aqui o titular corrige nome e telefone, gera outra senha (por
 * WhatsApp ou SMS) e revoga o acesso, que vale na hora.
 */
export default function CaregiverManage() {
  const navigate = useNavigate();
  const goBack = useGoBackOr('/perfil');
  const { showToast } = useToast();

  const caregiverQuery = useMyCaregiver();
  const linksQuery = useCaregiverLinks();
  const revoke = useRevokeCaregiver();
  const resetPassword = useResetCaregiverPassword();
  const setHandoff = useCaregiverHandoffStore((state) => state.setHandoff);

  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [choosingDelivery, setChoosingDelivery] = useState(false);
  const [pendingDelivery, setPendingDelivery] = useState<CaregiverDelivery | null>(null);

  const caregiver = caregiverQuery.data ?? null;
  const links = linksQuery.data ?? [];
  const activeLink = links.find((link) => link.status === 'active') ?? null;

  // `isPending`: sem rede a leitura fica pausada, sem dado e sem erro; com
  // `isLoading` a tela diria "sem acompanhante" a quem tem um.
  if (caregiverQuery.isPending) {
    return (
      <FlowScreen title="Meu acompanhante" onBack={goBack}>
        <ManageSkeleton />
      </FlowScreen>
    );
  }

  // Só cai no erro quando não há o que mostrar: uma releitura que falha (voltar
  // do WhatsApp com a rede ruim, por exemplo) mantém o `data` e liga `isError`,
  // e trocar o cartão que já estava na tela por um erro seria pior que ficar
  // com ele. `null` é um dado válido: "sem acompanhante".
  if (caregiverQuery.isError && caregiverQuery.data === undefined) {
    return (
      <FlowScreen title="Meu acompanhante" onBack={goBack}>
        <ErrorState
          className="min-h-0 py-10"
          title="Não foi possível carregar seu acompanhante"
          description={describeLoadError(caregiverQuery.error)}
          onRetry={() => {
            void caregiverQuery.refetch();
            void linksQuery.refetch();
          }}
        />
      </FlowScreen>
    );
  }

  async function handleRevoke() {
    if (!activeLink) return;

    try {
      await revoke.mutateAsync(activeLink.id);
      showToast('Acesso revogado.', { variant: 'success' });
    } catch (error) {
      showToast(describeMutationError(error, 'Não foi possível revogar o acesso.'), { variant: 'error' });
    } finally {
      setConfirmingRevoke(false);
    }
  }

  async function handleGenerate(delivery: CaregiverDelivery) {
    if (!caregiver) return;

    const base = toHandoffBase(caregiver);
    setPendingDelivery(delivery);

    try {
      const access = await resetPassword.mutateAsync({ delivery });
      setHandoff(handoffFromAccess(base, delivery, access));
      setChoosingDelivery(false);
      navigate('/perfil/acompanhante/enviar');
    } catch (error) {
      // O SMS que não saiu deixa a conta com senha nova: a tela de envio explica.
      const failure = handoffFromSmsFailure(base, error);
      if (failure) {
        setHandoff(failure);
        setChoosingDelivery(false);
        navigate('/perfil/acompanhante/enviar');
      } else {
        showToast(describeMutationError(error, 'Não foi possível gerar a nova senha.'), { variant: 'error' });
      }
    } finally {
      setPendingDelivery(null);
    }
  }

  if (!caregiver) {
    return (
      <FlowScreen
        title="Meu acompanhante"
        subtitle="Uma pessoa de confiança que entra no app com login próprio e acompanha a sua rotina. Você cria o acesso e pode revogá-lo quando quiser."
        onBack={goBack}
      >
        <DemoNotice />

        <Button fullWidth iconLeft={Plus} onClick={() => navigate('/perfil/acompanhante/novo')}>
          Adicionar acompanhante
        </Button>

        <ScopePanel />

        {linksQuery.isError && linksQuery.data === undefined ? (
          <InlineError
            title="Não foi possível carregar o histórico"
            onRetry={() => void linksQuery.refetch()}
          />
        ) : (
          <LinkHistory links={links} />
        )}

        <div className="flex items-start gap-2.5 text-[12px]/[1.5] text-muted-foreground">
          <Users size={14} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>Você pode ter um acompanhante por vez. A pessoa nunca usa a sua senha.</p>
        </div>
      </FlowScreen>
    );
  }

  const name = firstName(caregiver.fullName) || 'O acompanhante';

  return (
    <>
      <FlowScreen title="Meu acompanhante" onBack={goBack}>
        <DemoNotice />

        <CaregiverCard
          caregiver={caregiver}
          onEdit={() => navigate('/perfil/acompanhante/editar')}
          onResetPassword={() => setChoosingDelivery(true)}
          onRevoke={() => {
            if (!activeLink) {
              showToast('Não conseguimos localizar o vínculo agora. Atualize a tela e tente de novo.', {
                variant: 'error',
              });
              void linksQuery.refetch();
              return;
            }
            setConfirmingRevoke(true);
          }}
        />

        <ScopePanel />

        {linksQuery.isError && linksQuery.data === undefined ? (
          <InlineError
            title="Não foi possível carregar o histórico"
            onRetry={() => void linksQuery.refetch()}
          />
        ) : (
          <LinkHistory links={links} />
        )}
      </FlowScreen>

      <ConfirmDialog
        open={confirmingRevoke}
        title={`Revogar o acesso de ${name}?`}
        description={`${name} perde o acesso agora e não vê mais nenhum dado seu. Você não precisa trocar a sua senha. Para dar acesso de novo, será preciso adicionar um acompanhante.`}
        confirmLabel="Revogar acesso"
        destructive
        titleIcon={Ban}
        loading={revoke.isPending}
        onConfirm={() => void handleRevoke()}
        onCancel={() => setConfirmingRevoke(false)}
      />

      <Modal
        open={choosingDelivery}
        onClose={resetPassword.isPending ? undefined : () => setChoosingDelivery(false)}
        title="Gerar nova senha"
        footer={
          // Os dois botões um sobre o outro: o rodapé do `Modal` é uma linha e
          // os rótulos não cabem lado a lado em 320 px.
          <div className="flex w-full flex-col gap-3">
            <Button
              fullWidth
              iconLeft={MessageCircle}
              loading={pendingDelivery === 'whatsapp'}
              disabled={resetPassword.isPending}
              onClick={() => void handleGenerate('whatsapp')}
            >
              Enviar por WhatsApp
            </Button>
            <Button
              fullWidth
              variant="outline"
              iconLeft={Smartphone}
              loading={pendingDelivery === 'sms'}
              disabled={resetPassword.isPending}
              onClick={() => void handleGenerate('sms')}
            >
              Enviar por SMS
            </Button>
          </div>
        }
      >
        <p className="text-[14px]/[1.6] text-muted-foreground">
          A senha provisória anterior deixa de valer. Escolha como enviar a nova a {name}.
        </p>
      </Modal>
    </>
  );
}
