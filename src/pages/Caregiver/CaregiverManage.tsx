import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Ban, MessageCircle, Plus, Smartphone, TriangleAlert, Users } from 'lucide-react';
import FlowScreen from '../../components/ui/flow-screen';
import Button from '../../components/ui/button';
import ConfirmDialog from '../../components/ui/confirm-dialog';
import Modal from '../../components/ui/modal';
import ErrorState from '../../components/ui/error-state';
import InlineError from '../../components/ui/inline-error';
import Skeleton from '../../components/ui/skeleton';
import CaregiverCard from './CaregiverCard';
import CaregiverScopeSection from './CaregiverScopeSection';
import LinkHistory from './LinkHistory';
import ScopePanel from './ScopePanel';
import {
  prepareWhatsApp,
  useCaregiverIssuances,
  useCaregiverLinks,
  useCaregiverScopes,
  useMyCaregiver,
  useResetCaregiverPassword,
  useRevokeCaregiver,
} from '../../hooks/useCaregiver';
import { describeMutationError } from '../../hooks/useAuth';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import { useToast } from '../../contexts/ToastContext';
import { getCaregiverErrorCode, isOutcomeUnknown, isSmsProviderUnavailable } from '../../lib/caregiverError';
import { APP_STORE_URL, PLAY_STORE_URL } from '../../lib/features';
import { useCaregiverNoticeStore } from '../../stores/caregiverNoticeStore';
import { buildCaregiverAccessMessage, firstName } from '../../utils/caregiverMessage';
import { maskPhone } from '../../utils/contact';
import { fromInternationalPhone } from '../../utils/phone';
import type { CaregiverDelivery, CaregiverDeliveryNotice } from '../../types';

/**
 * Carregamento com a forma da tela: o cartão do acompanhante e o painel das
 * áreas, com os 24 px entre cartões da tela pronta.
 */
function ManageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando seu acompanhante">
      <Skeleton className="h-64 w-full rounded-2xl" />
      <Skeleton className="h-52 w-full rounded-2xl" />
    </div>
  );
}

/** O que cada aviso diz. A saída é sempre a mesma: gerar outra senha e mandar pelo WhatsApp. */
function describeNotice(notice: CaregiverDeliveryNotice, name: string): { title: string; body: string; action: string } {
  switch (notice) {
    case 'created-sms-failed':
      return {
        title: 'O SMS não foi enviado',
        body: `O acesso de ${name} foi criado, mas a mensagem não saiu. Envie os dados pelo WhatsApp.`,
        action: 'Enviar pelo WhatsApp',
      };
    case 'reset-sms-failed':
      return {
        title: 'O SMS não foi enviado',
        body: `A nova senha já vale, mas a mensagem não saiu — ${name} está sem acesso até recebê-la. Envie pelo WhatsApp.`,
        action: 'Enviar pelo WhatsApp',
      };
    case 'whatsapp-unconfirmed':
      return {
        title: 'O WhatsApp não abriu',
        body: `O WhatsApp não abriu neste aparelho, e a mensagem não chegou a ${name}. Envie de novo — uma nova senha é gerada e a anterior deixa de valer.`,
        action: 'Enviar de novo pelo WhatsApp',
      };
    case 'delivery-unconfirmed':
      return {
        title: 'Não foi possível confirmar o envio',
        body: `A resposta do servidor não chegou inteira, e não dá para saber se ${name} recebeu os dados. Envie de novo — uma nova senha é gerada e a anterior deixa de valer.`,
        action: 'Enviar de novo pelo WhatsApp',
      };
  }
}

interface DeliveryNoticeBannerProps {
  notice: CaregiverDeliveryNotice;
  name: string;
  sending: boolean;
  onSendWhatsApp: () => void;
}

/**
 * A senha foi emitida e não há certeza de que chegou. O texto diz qual dos
 * casos é — numa nova senha que não chegou, por exemplo, o acompanhante está
 * sem acesso agora —, e a saída fica a um toque.
 *
 * O bloco de alerta do guia: fundo `alert-soft` sem contorno, o triângulo no
 * vermelho e o texto em `ink`. O triângulo de 24 px já tem a altura da linha do
 * título (`text-body`, 24 px), e fica alinhado a ela sem ajuste.
 */
function DeliveryNoticeBanner({ notice, name, sending, onSendWhatsApp }: DeliveryNoticeBannerProps) {
  const { title, body, action } = describeNotice(notice, name);

  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-destructive-soft p-4">
      <div className="flex items-start gap-3">
        <TriangleAlert size={24} strokeWidth={2} className="shrink-0 text-destructive" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="text-body font-semibold text-foreground">{title}</p>
          <p className="text-body-sm text-foreground">{body}</p>
        </div>
      </div>
      {/* O rótulo mais longo ("Enviar de novo pelo WhatsApp", 226 px) não cabe
          numa linha em tela de menos de 390 px, e o `whitespace-nowrap` do
          botão o jogaria por cima do recuo e, a 320 px, para fora dele. Aqui
          ele quebra em duas linhas centradas, na entrelinha de 20 px do botão
          do guia, e o botão cresce a partir dos 48 px. */}
      <Button
        fullWidth
        iconLeft={MessageCircle}
        loading={sending}
        onClick={onSendWhatsApp}
        className="h-auto min-h-12 py-2 text-center text-body/5 whitespace-normal"
      >
        {action}
      </Button>
    </div>
  );
}

/**
 * Meu acompanhante: quem está vinculado (ou como adicionar alguém), o que essa
 * pessoa pode ver, e o registro das autorizações.
 *
 * O acompanhante nasce direto na conta do titular, com senha provisória — não
 * há convite. Daqui o titular corrige nome e telefone, gera outra senha (o
 * WhatsApp abre direto na conversa; o SMS sai sozinho), libera e retira áreas
 * e revoga o acesso, que vale na hora.
 */
export default function CaregiverManage() {
  const navigate = useNavigate();
  const goBack = useGoBackOr('/perfil');
  const { showToast } = useToast();

  const caregiverQuery = useMyCaregiver();
  const linksQuery = useCaregiverLinks();
  const issuancesQuery = useCaregiverIssuances();
  const scopesQuery = useCaregiverScopes();
  const revoke = useRevokeCaregiver();
  const resetPassword = useResetCaregiverPassword();

  const notice = useCaregiverNoticeStore((state) => state.notice);
  const expectCaregiver = useCaregiverNoticeStore((state) => state.expectCaregiver);
  const setNotice = useCaregiverNoticeStore((state) => state.setNotice);
  const settleExpectation = useCaregiverNoticeStore((state) => state.settleExpectation);

  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [choosingDelivery, setChoosingDelivery] = useState(false);
  const [pendingDelivery, setPendingDelivery] = useState<CaregiverDelivery | null>(null);

  const caregiver = caregiverQuery.data ?? null;
  const links = linksQuery.data ?? [];
  // O registro de autorizações é complemento: se falhar, o histórico aparece
  // sem as emissões em vez de derrubar a tela.
  const issuances = issuancesQuery.data ?? [];

  // Um acompanhante acabou de ser criado e a releitura ainda está a caminho:
  // enquanto ela não volta, "sem acompanhante" seria mentira — e esconderia o
  // aviso de entrega, que só existe com o acompanhante na tela.
  const awaitingNewCaregiver = expectCaregiver && !caregiver;

  // A expectativa se resolve quando o banco responde: com o acompanhante, ou
  // dizendo que não há (a criação não chegou a acontecer). Um aviso sem
  // acompanhante não tem a quem se referir, e sai junto.
  useEffect(() => {
    if (caregiver) {
      if (expectCaregiver) settleExpectation();
      return;
    }
    if (caregiverQuery.isFetching || caregiverQuery.isError) return;
    if (expectCaregiver) settleExpectation();
    if (notice) setNotice(null);
  }, [
    caregiver,
    caregiverQuery.isFetching,
    caregiverQuery.isError,
    expectCaregiver,
    notice,
    settleExpectation,
    setNotice,
  ]);

  // `isPending`: sem rede a leitura fica pausada, sem dado e sem erro; com
  // `isLoading` a tela diria "sem acompanhante" a quem tem um.
  if (caregiverQuery.isPending || (awaitingNewCaregiver && caregiverQuery.isFetching)) {
    return (
      <FlowScreen title="Meu acompanhante" onBack={goBack}>
        <ManageSkeleton />
      </FlowScreen>
    );
  }

  // Só cai no erro quando não há o que mostrar: uma releitura que falha (voltar
  // do WhatsApp com a rede ruim, por exemplo) mantém o `data` e liga `isError`,
  // e trocar o cartão que já estava na tela por um erro seria pior que ficar
  // com ele. Logo depois de uma criação, porém, o `null` guardado é velho — e
  // aí a falha da releitura também é erro, e não "sem acompanhante".
  if (caregiverQuery.isError && (caregiverQuery.data === undefined || awaitingNewCaregiver)) {
    return (
      <FlowScreen title="Meu acompanhante" onBack={goBack}>
        <ErrorState
          className="min-h-0 py-10"
          title="Não foi possível carregar seu acompanhante"
          description={describeMutationError(caregiverQuery.error, 'Verifique sua conexão e tente de novo.')}
          onRetry={() => {
            void caregiverQuery.refetch();
            void linksQuery.refetch();
            void issuancesQuery.refetch();
          }}
        />
      </FlowScreen>
    );
  }

  async function handleRevoke() {
    if (!caregiver) return;

    try {
      // `get_my_caregiver()` já devolve o vínculo corrente, pendente ou ativo:
      // é ele que se revoga, inclusive o recém-criado que ainda nem entrou.
      await revoke.mutateAsync(caregiver.linkId);
      setNotice(null);
      showToast('Acesso revogado.', { variant: 'success' });
    } catch (error) {
      showToast(describeMutationError(error, 'Não foi possível revogar o acesso.'), { variant: 'error' });
    } finally {
      setConfirmingRevoke(false);
    }
  }

  /**
   * "Reenviar acesso": gera outra senha provisória e a entrega. WhatsApp: abre a
   * conversa do acompanhante com a mensagem pronta e confirma que ele abriu.
   * SMS: o servidor envia sozinho.
   */
  async function handleGenerate(delivery: CaregiverDelivery) {
    if (!caregiver) return;

    setPendingDelivery(delivery);
    // No toque, antes de qualquer espera (ver `prepareWhatsApp`).
    const whatsApp = delivery === 'whatsapp' ? prepareWhatsApp() : null;
    // Passou deste ponto, a senha anterior já não vale: falha depois disso não
    // pode ser silenciosa.
    let rotated = false;

    try {
      const access = await resetPassword.mutateAsync({ delivery });
      rotated = true;
      setChoosingDelivery(false);
      setNotice(null);

      if (access.temporaryPassword && whatsApp) {
        const opened = await whatsApp.open(
          caregiver.phone,
          buildCaregiverAccessMessage({
            // Quem nunca concluiu o primeiro acesso ainda não sabe que tem um:
            // para essa pessoa a mensagem é a de cadastro, não a de "nova
            // senha". `activated_at` não se apaga num reset, então diz se a
            // pessoa já entrou alguma vez.
            reason: caregiver.activatedAt ? 'reset' : 'created',
            fullName: caregiver.fullName,
            login: access.login ?? caregiver.email,
            temporaryPassword: access.temporaryPassword,
            expiresAt: access.expiresAt,
            appStoreUrl: APP_STORE_URL,
            playStoreUrl: PLAY_STORE_URL,
          })
        );

        if (opened) {
          showToast('Acesso reenviado. Toque em enviar no WhatsApp para concluir.', { variant: 'success' });
        } else {
          setNotice('whatsapp-unconfirmed');
        }
      } else {
        const phone = access.phoneMasked ?? maskPhone(fromInternationalPhone(caregiver.phone));
        showToast(`Acesso reenviado por SMS para ${phone}.`, { variant: 'success' });
      }
    } catch (error) {
      whatsApp?.cancel();

      if (rotated) {
        setChoosingDelivery(false);
        setNotice('delivery-unconfirmed');
        return;
      }

      // A senha nova já vale e o SMS não saiu: o acompanhante ficou sem
      // acesso. O aviso fica na tela, com o WhatsApp a um toque.
      if (getCaregiverErrorCode(error) === 'sms_failed' && !isSmsProviderUnavailable(error)) {
        setChoosingDelivery(false);
        setNotice('reset-sms-failed');
        return;
      }

      // A resposta não voltou: a senha pode ter sido trocada sem que a nova
      // chegasse a alguém.
      if (isOutcomeUnknown(error)) {
        setChoosingDelivery(false);
        setNotice('delivery-unconfirmed');
        return;
      }

      showToast(describeMutationError(error, 'Não foi possível reenviar o acesso.'), { variant: 'error' });
    } finally {
      setPendingDelivery(null);
    }
  }

  const history =
    linksQuery.isError && linksQuery.data === undefined ? (
      <InlineError title="Não foi possível carregar o histórico" onRetry={() => void linksQuery.refetch()} />
    ) : (
      <LinkHistory links={links} issuances={issuances} />
    );

  if (!caregiver) {
    // Só promete a escolha das áreas quando o banco a cumpre ([BANCO 32]).
    const subtitle = scopesQuery.data?.supported
      ? 'Uma pessoa de confiança que entra no app com login próprio e acompanha a sua rotina. Você escolhe o que ela vê e pode revogar o acesso quando quiser.'
      : 'Uma pessoa de confiança que entra no app com login próprio e acompanha a sua rotina. Você cria o acesso e pode revogá-lo quando quiser.';

    return (
      <FlowScreen title="Meu acompanhante" subtitle={subtitle} onBack={goBack}>
        {/* 24 px entre os blocos, a distância do guia entre cartões (a moldura
            dá 16, a dos campos de formulário). */}
        <div className="flex flex-col gap-6">
          <Button fullWidth iconLeft={Plus} onClick={() => navigate('/perfil/acompanhante/novo')}>
            Adicionar acompanhante
          </Button>

          <ScopePanel />

          {history}

          {/* O ícone de 16 px a 8 px do texto, como no rodapé dos cartões do
              guia; o `mt-px` o centra na linha da legenda (18 px). */}
          <div className="flex items-start gap-2 text-caption font-medium text-muted-foreground">
            <Users size={16} strokeWidth={2} className="mt-px shrink-0" aria-hidden="true" />
            <p>Você pode ter um acompanhante por vez. A pessoa nunca usa a sua senha.</p>
          </div>
        </div>
      </FlowScreen>
    );
  }

  const name = firstName(caregiver.fullName) || 'O acompanhante';

  return (
    <>
      <FlowScreen title="Meu acompanhante" onBack={goBack}>
        {/* 24 px entre os cartões, como pede o guia. */}
        <div className="flex flex-col gap-6">
          {notice && (
            <DeliveryNoticeBanner
              notice={notice}
              name={name}
              sending={pendingDelivery === 'whatsapp'}
              onSendWhatsApp={() => void handleGenerate('whatsapp')}
            />
          )}

          <CaregiverCard
            caregiver={caregiver}
            onEdit={() => navigate('/perfil/acompanhante/editar')}
            onResetPassword={() => setChoosingDelivery(true)}
            onRevoke={() => setConfirmingRevoke(true)}
          />

          <CaregiverScopeSection name={name} />

          {history}
        </div>
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
        onClose={pendingDelivery ? undefined : () => setChoosingDelivery(false)}
        title="Reenviar acesso"
        footer={
          // Os dois botões um sobre o outro: o rodapé do `Modal` é uma linha e
          // os rótulos não cabem lado a lado em 320 px.
          <div className="flex w-full flex-col gap-3">
            <Button
              fullWidth
              iconLeft={MessageCircle}
              loading={pendingDelivery === 'whatsapp'}
              disabled={pendingDelivery !== null}
              onClick={() => void handleGenerate('whatsapp')}
            >
              Enviar pelo WhatsApp
            </Button>
            <Button
              fullWidth
              variant="outline"
              iconLeft={Smartphone}
              loading={pendingDelivery === 'sms'}
              disabled={pendingDelivery !== null}
              onClick={() => void handleGenerate('sms')}
            >
              Enviar por SMS
            </Button>
          </div>
        }
      >
        <p className="text-body-sm text-muted-foreground">
          Uma nova senha provisória é enviada a {name}.{' '}
          {caregiver.status === 'active'
            ? 'A senha que essa pessoa usa hoje deixa de valer na hora, e o acesso fica suspenso até a nova ser trocada.'
            : 'A senha provisória anterior deixa de valer.'}
        </p>
      </Modal>
    </>
  );
}
