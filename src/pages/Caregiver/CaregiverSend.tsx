import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import { CircleCheck, Eye, EyeOff, Info, MessageCircle, TriangleAlert } from 'lucide-react';
import FlowScreen from '../../components/ui/flow-screen';
import Button from '../../components/ui/button';
import DemoNotice from './DemoNotice';
import { handoffFromAccess, handoffFromSmsFailure } from './handoff';
import { describeMutationError } from '../../hooks/useAuth';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import { openWhatsApp, useResetCaregiverPassword } from '../../hooks/useCaregiver';
import { useToast } from '../../contexts/ToastContext';
import { useCaregiverHandoffStore } from '../../stores/caregiverHandoffStore';
import { APP_STORE_URL, CAREGIVER_DEMO_ENABLED, PLAY_STORE_URL } from '../../lib/features';
import { buildCaregiverAccessMessage, buildWhatsAppUrl, firstName } from '../../utils/caregiverMessage';
import { maskEmail, maskPhone } from '../../utils/contact';
import { formatDateTimeBr } from '../../utils/date';
import { fromInternationalPhone } from '../../utils/phone';
import type { CaregiverDelivery } from '../../types';

const CAREGIVER_PATH = '/perfil/acompanhante';

/**
 * Enviar os dados de acesso ao acompanhante.
 *
 * Três casos, todos a partir do que o servidor respondeu:
 * - WhatsApp: a senha provisória veio e aparece só aqui; o app monta a mensagem
 *   e abre o WhatsApp (`whatsapp://send`). Sair desta tela apaga a senha — quem
 *   a perdeu gera outra.
 * - SMS: o servidor enviou e o app nunca viu a senha.
 * - SMS que não saiu: a conta existe; a tela oferece gerar outra senha e tentar
 *   de novo, por SMS ou WhatsApp.
 */
export default function CaregiverSend() {
  const finish = useGoBackOr(CAREGIVER_PATH);
  const { showToast } = useToast();
  const handoff = useCaregiverHandoffStore((state) => state.handoff);
  const setHandoff = useCaregiverHandoffStore((state) => state.setHandoff);
  const clearHandoff = useCaregiverHandoffStore((state) => state.clear);
  const resetPassword = useResetCaregiverPassword();
  const [showPassword, setShowPassword] = useState(false);
  const [pendingDelivery, setPendingDelivery] = useState<CaregiverDelivery | null>(null);

  // Apaga a senha ao sair da tela, por qualquer caminho (botão, voltar do
  // sistema, troca de rota). É aqui, e não em `finish`, que ela é apagada:
  // limpar antes de navegar faria a guarda `!handoff` abaixo mandar a pessoa
  // para a gestão por conta própria, brigando com o "voltar". O adiamento de um turno existe por causa do modo
  // estrito do React, que desmonta e monta de novo na hora: sem ele a senha
  // sumiria no desenvolvimento antes de a tela aparecer.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current) clearHandoff();
      });
    };
  }, [clearHandoff]);

  if (!handoff) return <Navigate to={CAREGIVER_PATH} replace />;

  const base = { fullName: handoff.fullName, email: handoff.email, phone: handoff.phone };
  const name = firstName(handoff.fullName) || 'o acompanhante';
  const maskedPhone = maskPhone(fromInternationalPhone(handoff.phone));

  async function regenerate(delivery: CaregiverDelivery) {
    setPendingDelivery(delivery);

    try {
      const access = await resetPassword.mutateAsync({ delivery });
      setShowPassword(false);
      setHandoff(handoffFromAccess(base, delivery, access));
    } catch (error) {
      const failure = handoffFromSmsFailure(base, error);
      if (failure) {
        setHandoff(failure);
      } else {
        showToast(describeMutationError(error, 'Não foi possível gerar a nova senha.'), { variant: 'error' });
      }
    } finally {
      setPendingDelivery(null);
    }
  }

  // ------------------------------------------------------------ o SMS não saiu
  if (handoff.smsFailed) {
    return (
      <FlowScreen
        title="O SMS não saiu"
        subtitle={`O acesso de ${name} já foi criado, mas a mensagem não chegou. Gere uma nova senha e tente de novo, por SMS ou por WhatsApp.`}
        onBack={finish}
        footer={
          <>
            <Button fullWidth loading={pendingDelivery === 'sms'} disabled={resetPassword.isPending} onClick={() => void regenerate('sms')}>
              Gerar nova senha e reenviar por SMS
            </Button>
            <Button
              fullWidth
              variant="outline"
              iconLeft={MessageCircle}
              loading={pendingDelivery === 'whatsapp'}
              disabled={resetPassword.isPending}
              onClick={() => void regenerate('whatsapp')}
            >
              Enviar por WhatsApp
            </Button>
          </>
        }
      >
        <DemoNotice withFirstAccessLink={false} />

        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] p-4">
          <TriangleAlert size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-[14px] font-semibold text-foreground">Não foi possível enviar o SMS</p>
            <p className="text-[12px]/[1.45] text-muted-foreground">
              Verifique o número: {maskedPhone}. Se estiver certo, tente de novo em instantes.
            </p>
          </div>
        </div>
      </FlowScreen>
    );
  }

  // ------------------------------------------------------------ SMS enviado
  if (handoff.temporaryPassword === null) {
    return (
      <FlowScreen
        title="Acesso criado"
        subtitle={`Enviamos os dados de acesso de ${name} por SMS para ${maskedPhone}.`}
        onBack={finish}
        footer={
          <Button fullWidth onClick={finish}>
            Concluir
          </Button>
        }
      >
        <DemoNotice withFirstAccessLink={false} />

        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
          <CircleCheck size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--color-supera-seguranca)]" aria-hidden="true" />
          <p className="text-[14px]/[1.5] text-foreground">
            {name} entra com o e-mail e a senha provisória da mensagem, e escolhe uma senha própria no primeiro acesso.
            {handoff.expiresAt && ` A senha provisória vale até ${formatDateTimeBr(handoff.expiresAt)}.`}
          </p>
        </div>
      </FlowScreen>
    );
  }

  // ------------------------------------------------------------ WhatsApp
  const password = handoff.temporaryPassword;
  // A prévia mostra a mensagem como vai sair, mas com o e-mail mascarado e a
  // senha escondida até o titular pedir para ver (mesma regra do cartão do
  // acompanhante). O que abre no WhatsApp leva os valores reais.
  const shownPassword = showPassword ? password : '•'.repeat(password.length);
  const previewMessage = buildCaregiverAccessMessage({
    fullName: handoff.fullName,
    email: showPassword ? handoff.email : maskEmail(handoff.email),
    temporaryPassword: shownPassword,
    appStoreUrl: APP_STORE_URL,
    playStoreUrl: PLAY_STORE_URL,
  });

  function openInWhatsApp() {
    // A demonstração não manda nada a ninguém: o celular digitado pode ser de
    // uma pessoa de verdade, e a mensagem leva e-mail e senha.
    if (CAREGIVER_DEMO_ENABLED) {
      showToast('Demonstração: o WhatsApp não é aberto. No app, esta mensagem vai para o WhatsApp do acompanhante.', {
        variant: 'info',
      });
      return;
    }

    openWhatsApp(
      buildWhatsAppUrl(
        handoff!.phone,
        buildCaregiverAccessMessage({
          fullName: handoff!.fullName,
          email: handoff!.email,
          temporaryPassword: password,
          appStoreUrl: APP_STORE_URL,
          playStoreUrl: PLAY_STORE_URL,
        })
      )
    );
  }

  return (
    <FlowScreen
      title="Acesso criado"
      subtitle={`Falta só enviar os dados para ${name}. A senha aparece agora e não aparece de novo: se sair desta tela, será preciso gerar outra.`}
      onBack={finish}
      footer={
        <>
          <Button fullWidth iconLeft={MessageCircle} onClick={openInWhatsApp}>
            Abrir WhatsApp
          </Button>
          <Button variant="ghost" fullWidth loading={pendingDelivery === 'sms'} disabled={resetPassword.isPending} onClick={() => void regenerate('sms')}>
            Sem WhatsApp? Enviar por SMS
          </Button>
          <Button variant="ghost" fullWidth onClick={finish}>
            Concluir
          </Button>
        </>
      }
    >
      <DemoNotice withFirstAccessLink={false} />

      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-medium text-muted-foreground">Mensagem que será enviada</p>
        <p className="rounded-2xl rounded-tl-sm border border-border bg-muted p-4 text-[13px]/[1.6] break-words whitespace-pre-line text-foreground">
          {previewMessage}
        </p>
        <button
          type="button"
          aria-pressed={showPassword}
          onClick={() => setShowPassword((current) => !current)}
          className="inline-flex min-h-[44px] w-fit cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-[13px] font-medium text-[var(--color-supera-seguranca)] hover:underline"
        >
          {showPassword ? (
            <EyeOff size={16} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Eye size={16} strokeWidth={2} aria-hidden="true" />
          )}
          {showPassword ? 'Ocultar senha e e-mail' : 'Mostrar senha e e-mail'}
        </button>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-3.5">
        <Info size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--color-supera-seguranca)]" aria-hidden="true" />
        <p className="text-[12px]/[1.5] text-muted-foreground">
          A senha fica no histórico do WhatsApp. Ela vale até {formatDateTimeBr(handoff.expiresAt)} e só funciona até {name} trocá-la no primeiro acesso.
        </p>
      </div>
    </FlowScreen>
  );
}
