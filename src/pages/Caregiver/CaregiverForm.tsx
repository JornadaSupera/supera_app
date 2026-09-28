import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate } from 'react-router';
import FlowScreen from '../../components/ui/flow-screen';
import Input from '../../components/ui/input';
import Button from '../../components/ui/button';
import Loading from '../../components/ui/loading';
import ErrorState from '../../components/ui/error-state';
import InlineError from '../../components/ui/inline-error';
import Skeleton from '../../components/ui/skeleton';
import DeliveryOptions from './DeliveryOptions';
import ScopePanel from './ScopePanel';
import ScopeSwitches from './ScopeSwitches';
import AuthorizationConsent from './AuthorizationConsent';
import { describeMutationError } from '../../hooks/useAuth';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import {
  prepareWhatsApp,
  useCaregiverScopes,
  useCreateCaregiver,
  useMyCaregiver,
} from '../../hooks/useCaregiver';
import { useToast } from '../../contexts/ToastContext';
import { getCaregiverErrorCode, isOutcomeUnknown, isSmsProviderUnavailable } from '../../lib/caregiverError';
import { APP_STORE_URL, PLAY_STORE_URL } from '../../lib/features';
import { caregiverSchema, type CaregiverFormValues } from '../../schemas/caregiver';
import { useCaregiverNoticeStore } from '../../stores/caregiverNoticeStore';
import { ALL_CAREGIVER_SCOPES } from '../../utils/caregiverScopes';
import { buildCaregiverAccessMessage } from '../../utils/caregiverMessage';
import { maskPhone } from '../../utils/contact';
import { formatPhone } from '../../utils/masks';
import { maskedRegister } from '../../utils/maskedInput';
import { fromInternationalPhone, toInternationalPhone } from '../../utils/phone';
import type { CaregiverScope } from '../../types';

const FORM_ID = 'caregiver-form';
const CAREGIVER_PATH = '/perfil/acompanhante';

/** Toda área ligada: o ponto de partida de um acompanhante novo. */
const ALL_SCOPES_ON = Object.fromEntries(ALL_CAREGIVER_SCOPES.map((scope) => [scope, true])) as Record<
  CaregiverScope,
  boolean
>;

const SMS_UNAVAILABLE_ON_FIELD = 'O envio por SMS ainda não está disponível. Escolha WhatsApp para enviar agora.';

/**
 * Adicionar acompanhante — tudo numa tela, sem etapas.
 *
 * Nome, celular, e-mail (o login), como enviar, o que a pessoa pode ver e a
 * autorização. Ao tocar em "Criar acesso":
 *
 * - **WhatsApp**: o servidor cria o acesso e devolve a senha provisória, que
 *   vai direto para a mensagem — o WhatsApp abre na conversa desse número, com
 *   o texto pronto, e a pessoa só toca em enviar. A senha não passa por tela
 *   nenhuma nem fica guardada em lugar nenhum do app.
 * - **SMS**: o servidor cria o acesso e manda o SMS na mesma chamada,
 *   automaticamente. O app nunca vê a senha.
 *
 * Nos dois casos a tela VOLTA para "Meu acompanhante" (volta no histórico, em
 * vez de empilhar a mesma tela duas vezes), que já mostra o novo acesso
 * aguardando o primeiro login. Se a entrega não se confirmou — SMS que não saiu,
 * WhatsApp que não abriu, resposta que não chegou inteira —, a gestão abre com
 * o aviso e o reenvio a um toque.
 */
export default function CaregiverForm() {
  const goBack = useGoBackOr(CAREGIVER_PATH);
  const { showToast } = useToast();
  const myCaregiver = useMyCaregiver();
  const scopesQuery = useCaregiverScopes();
  const create = useCreateCaregiver();
  const reportToManage = useCaregiverNoticeStore((state) => state.report);
  const clearNotice = useCaregiverNoticeStore((state) => state.clear);
  // Cobre o envio inteiro — criar, abrir o WhatsApp e confirmar que ele
  // abriu —, e não só a chamada ao servidor: a confirmação leva até 2,5 s, e o
  // botão não pode voltar a ficar livre nesse meio-tempo.
  const [sending, setSending] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<CaregiverFormValues>({
    resolver: zodResolver(caregiverSchema),
    mode: 'onTouched',
    defaultValues: {
      fullName: '',
      phone: '',
      email: '',
      delivery: 'whatsapp',
      scopes: ALL_SCOPES_ON,
      authorized: false,
    },
  });

  // Só cabe um acompanhante por vez: quem já tem um vai gerenciá-lo.
  if (myCaregiver.isPending) return <Loading />;

  // A leitura FALHOU: não dá para afirmar que não há acompanhante. Deixar o
  // formulário aberto aqui levaria o titular a preencher tudo para receber
  // `caregiver_already_active` no envio — o banco só aceita um vínculo
  // corrente por paciente.
  if (myCaregiver.isError) {
    return (
      <FlowScreen title="Adicionar acompanhante" onBack={goBack}>
        <ErrorState
          className="min-h-0 py-10"
          title="Não foi possível conferir se você já tem um acompanhante"
          description={describeMutationError(myCaregiver.error, 'Verifique sua conexão e tente de novo.')}
          onRetry={() => void myCaregiver.refetch()}
        />
      </FlowScreen>
    );
  }

  // Fora do envio: durante ele, a releitura disparada pela criação acha o novo
  // acompanhante no meio do caminho (a confirmação do WhatsApp leva até 2,5 s),
  // e esta guarda trocaria a tela antes de o fluxo terminar — e empilharia a
  // gestão duas vezes no histórico.
  if (myCaregiver.data && !sending) return <Navigate to={CAREGIVER_PATH} replace />;

  // O que está sendo autorizado precisa estar resolvido antes de criar: sem
  // saber se o banco tem o controle por área, a tela não sabe se mostra
  // interruptores ou o escopo fixo — e a autorização é "com o acesso acima".
  const scopesSupported = scopesQuery.data?.supported === true;
  const scopesReady = scopesQuery.isSuccess;

  const submit = handleSubmit(async (values) => {
    const scopes = scopesSupported ? ALL_CAREGIVER_SCOPES.filter((scope) => values.scopes[scope]) : undefined;

    // Um acesso que não vê nada não serve para nada. Na gestão, desligar tudo
    // é permitido — é pausar o acesso sem revogá-lo —, mas criar assim, não.
    if (scopes && scopes.length === 0) {
      setError('scopes', { type: 'manual', message: 'Libere pelo menos uma área.' });
      return;
    }

    const base = {
      fullName: values.fullName.trim(),
      email: values.email.trim().toLowerCase(),
      phone: toInternationalPhone(values.phone),
    };

    clearNotice();
    setSending(true);
    // No toque, antes de qualquer espera: no computador reserva a aba do
    // WhatsApp Web (o navegador só deixa abri-la no instante do gesto); no
    // celular não reserva nada.
    const whatsApp = values.delivery === 'whatsapp' ? prepareWhatsApp() : null;
    // Passou deste ponto, o acesso EXISTE: qualquer falha dali em diante perde
    // a senha, que só vinha na resposta — e não pode ser silenciosa.
    let created = false;

    try {
      const access = await create.mutateAsync({ ...base, delivery: values.delivery, scopes });
      created = true;

      if (access.temporaryPassword && whatsApp) {
        const opened = await whatsApp.open(
          base.phone,
          buildCaregiverAccessMessage({
            reason: 'created',
            fullName: base.fullName,
            login: access.login ?? base.email,
            temporaryPassword: access.temporaryPassword,
            expiresAt: access.expiresAt,
            appStoreUrl: APP_STORE_URL,
            playStoreUrl: PLAY_STORE_URL,
          })
        );

        if (opened) {
          showToast('Acesso criado. Toque em enviar no WhatsApp para concluir.', { variant: 'success' });
          reportToManage({ notice: null, expectCaregiver: true });
        } else {
          // O WhatsApp não assumiu a tela: a senha desta mensagem não chegou a
          // ninguém. Nada de "enviado" — a gestão abre com o reenvio.
          reportToManage({ notice: 'whatsapp-unconfirmed', expectCaregiver: true });
        }
      } else {
        const phone = access.phoneMasked ?? maskPhone(fromInternationalPhone(base.phone));
        showToast(`Acesso criado. Os dados foram enviados por SMS para ${phone}.`, { variant: 'success' });
        reportToManage({ notice: null, expectCaregiver: true });
      }

      // Sai da tela com `sending` ainda ligado: o botão segue ocupado até ela
      // desmontar, e a guarda acima não dispara no caminho.
      goBack();
    } catch (error) {
      whatsApp?.cancel();

      if (created) {
        reportToManage({ notice: 'delivery-unconfirmed', expectCaregiver: true });
        goBack();
        return;
      }

      const code = getCaregiverErrorCode(error);

      // O acesso nasceu e só a mensagem não saiu: a gestão abre com o reenvio.
      if (code === 'sms_failed' && !isSmsProviderUnavailable(error)) {
        reportToManage({ notice: 'created-sms-failed', expectCaregiver: true });
        goBack();
        return;
      }

      // A conta pode ter sido criada com a resposta incompleta — e a senha,
      // que só existia nela, não chegou. A gestão confere e oferece o reenvio.
      if (code === 'incomplete_response') {
        reportToManage({ notice: 'delivery-unconfirmed', expectCaregiver: true });
        goBack();
        return;
      }

      // Daqui para baixo a pessoa FICA no formulário, com tudo o que digitou.
      setSending(false);

      // Provedor desligado: o servidor recusou ANTES de criar qualquer coisa.
      if (code === 'sms_failed') {
        setError('delivery', { type: 'server', message: SMS_UNAVAILABLE_ON_FIELD });
        return;
      }

      if (code === 'invalid_phone' || code === 'invalid_name' || code === 'invalid_email') {
        // Recusa de campo: a mensagem vai para o campo, e não para o aviso
        // geral — senão o titular lê "celular inválido" sem saber onde corrigir.
        const field = code === 'invalid_phone' ? 'phone' : code === 'invalid_name' ? 'fullName' : 'email';
        setError(field, { type: 'server', message: (error as Error).message });
        return;
      }

      if (isOutcomeUnknown(error)) {
        // A rede caiu com o pedido já no ar: o servidor pode ter criado o
        // acesso sem que a resposta voltasse. O formulário fica (com o aviso no
        // rodapé); se a releitura achar o acompanhante, a guarda desta tela leva
        // à gestão — e ela abre dizendo que a entrega não se confirmou, em vez
        // de o acesso aparecer lá como se tudo tivesse dado certo.
        reportToManage({ notice: 'delivery-unconfirmed', expectCaregiver: false });
      }
    }
  });

  // `scopes` é um registro (uma chave por área), e o tipo dos erros do RHF
  // trata `message` como se pudesse ser o erro de uma área chamada "message".
  // O erro que esta tela põe ali é sempre um texto.
  const rawScopesError: unknown = errors.scopes?.message;
  const scopesError = typeof rawScopesError === 'string' ? rawScopesError : undefined;

  // O aviso geral só aparece para o que não coube num campo.
  const errorCode = getCaregiverErrorCode(create.error);
  const shownOnField =
    errorCode === 'invalid_phone' ||
    errorCode === 'invalid_name' ||
    errorCode === 'invalid_email' ||
    (errorCode === 'sms_failed' && isSmsProviderUnavailable(create.error));
  const footerError =
    create.isError && !shownOnField
      ? describeMutationError(create.error, 'Não foi possível criar o acesso. Tente novamente.')
      : null;

  return (
    <FlowScreen
      title="Adicionar acompanhante"
      subtitle="A pessoa entra com uma senha provisória, válida por 72 horas, e cria a própria no primeiro acesso."
      onBack={goBack}
      footer={
        <>
          {footerError && (
            <p role="alert" className="text-center text-[12px] text-destructive">
              {footerError}
            </p>
          )}
          <Button
            type="submit"
            form={FORM_ID}
            fullWidth
            loading={sending}
            disabled={!scopesReady}
          >
            Criar acesso
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        noValidate
        className="flex flex-col gap-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Input
          label="Nome completo"
          id="caregiver-name"
          autoComplete="off"
          error={errors.fullName?.message}
          {...register('fullName')}
        />
        <Input
          label="Celular"
          id="caregiver-phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="(49) 99999-9999"
          error={errors.phone?.message}
          {...maskedRegister(register, 'phone', formatPhone)}
        />
        <Input
          label="E-mail"
          id="caregiver-email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          helperText="Será o login da pessoa."
          error={errors.email?.message}
          {...register('email')}
        />

        <DeliveryOptions
          registration={register('delivery', { onChange: () => clearErrors('delivery') })}
          error={errors.delivery?.message}
        />

        {/* O que a pessoa vai ver vem ANTES da autorização: é o que ela
            autoriza. Interruptores só quando o banco cumpre cada área; antes
            disso, a lista fixa — que é o que a RLS impõe hoje. */}
        {scopesQuery.isPending ? (
          <Skeleton className="h-40 w-full rounded-xl" aria-label="Carregando o que a pessoa pode ver" />
        ) : scopesQuery.isError ? (
          <InlineError
            title="Não foi possível carregar o que a pessoa pode ver"
            onRetry={() => void scopesQuery.refetch()}
          />
        ) : scopesSupported ? (
          <Controller
            name="scopes"
            control={control}
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <ScopeSwitches
                  compact
                  values={field.value as Record<CaregiverScope, boolean>}
                  onChange={(scope, enabled) => {
                    clearErrors('scopes');
                    field.onChange({ ...field.value, [scope]: enabled });
                  }}
                />
                {scopesError && (
                  <p role="alert" className="text-[12px] text-destructive">
                    {scopesError}
                  </p>
                )}
              </div>
            )}
          />
        ) : (
          <ScopePanel compact />
        )}

        <Controller
          name="authorized"
          control={control}
          render={({ field }) => (
            <AuthorizationConsent
              checked={field.value}
              onChange={field.onChange}
              error={errors.authorized?.message}
              ref={field.ref}
            />
          )}
        />
      </form>
    </FlowScreen>
  );
}
