import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router';
import { ShieldCheck } from 'lucide-react';
import { z } from 'zod';
import StickyFooter from '../../components/ui/sticky-footer';
import Checkbox from '../../components/ui/checkbox';
import Button from '../../components/ui/button';
import StepHeader from '../../components/ui/step-header';
import Loading from '../../components/ui/loading';
import ErrorState from '../../components/ui/error-state';
import EmptyState from '../../components/ui/empty-state';
import InlineError from '../../components/ui/inline-error';
import LegalDocumentLink from '../../components/LegalDocumentLink';
import { useCurrentLegalDocuments, useAcceptLegalTerms, useLegalDocumentOpener } from '../../hooks/useLegal';
import { describeMutationError, useSignOut } from '../../hooks/useAuth';
import { LEGAL_DOCUMENT_LABELS, isAddressOnlyBody } from '../../utils/legal';
import type { LegalDocumentVersion } from '../../types';

// O checkbox de "dados sensíveis de saúde" não tem `kind` próprio no banco
// (só existem `terms_of_use` e `privacy_policy`) — continua obrigatório na
// UI, mas o aceite dele fica coberto pela política de privacidade quando
// publicada, sem linha própria em `consent_records`.
function buildSchema(documentos: LegalDocumentVersion[]) {
  return z
    .object({
      aceitesDocumentos: z.record(z.string(), z.boolean()),
      aceitaDadosSensiveis: z.boolean(),
    })
    .refine((values) => documentos.every((doc) => values.aceitesDocumentos[doc.id] === true), {
      message: 'É necessário aceitar todos os termos.',
      path: ['aceitesDocumentos'],
    })
    .refine((values) => values.aceitaDadosSensiveis === true, {
      message: 'É necessário autorizar o tratamento de dados sensíveis.',
      path: ['aceitaDadosSensiveis'],
    });
}

type LgpdFormValues = {
  aceitesDocumentos: Record<string, boolean>;
  aceitaDadosSensiveis: boolean;
};

const FORM_ID = 'lgpd-form';

// Gate obrigatório pós-login, sem tela anterior pra voltar — "Sair" no lugar
// do back, igual aos outros bloqueios de `RequireAuth` (conta inativa / sem
// vínculo). O mesmo tipo do "Esqueci minha senha" do login (`text-label`,
// 14/20, em seminegrito, no verde escuro), com 48 px de toque e o `-ml-3` que
// alinha o texto à margem.
function SairAction() {
  const signOutMutation = useSignOut();
  return (
    <button
      type="button"
      onClick={() => signOutMutation.mutate()}
      className="-ml-3 min-h-12 cursor-pointer border-none bg-transparent px-3 text-label font-semibold text-primary-deep"
    >
      Sair
    </button>
  );
}

function LgpdForm({ documentos }: { documentos: LegalDocumentVersion[] }) {
  const navigate = useNavigate();
  const acceptMutation = useAcceptLegalTerms();
  const openLegalDocument = useLegalDocumentOpener();

  const schema = buildSchema(documentos);
  const { control, handleSubmit } = useForm<LgpdFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      aceitesDocumentos: Object.fromEntries(documentos.map((doc) => [doc.id, false])),
      aceitaDadosSensiveis: false,
    },
  });

  // Os checkboxes habilitam o botão assim que marcados, sem esperar submit —
  // por isso lê os valores ao vivo em vez de `formState.isValid`.
  const [aceitesDocumentos, aceitaDadosSensiveis] = useWatch({
    control,
    name: ['aceitesDocumentos', 'aceitaDadosSensiveis'],
  });

  const podeContinuar = Boolean(
    documentos.every((doc) => aceitesDocumentos?.[doc.id]) && aceitaDadosSensiveis
  );

  const onSubmit = () => {
    acceptMutation.mutate(undefined, {
      onSuccess: () => navigate('/home', { replace: true }),
    });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/* `px-safe-6`: a barra acompanha o recuo de 24 px do corpo e do rodapé
          (o padrão da `StepHeader` é 16 px). */}
      <StepHeader actions={<SairAction />} className="px-safe-6" />

      {/* 24 px de respiro em cima (da barra até a caixa) e embaixo (antes do
          rodapé), como nas outras telas com a `StepHeader`. */}
      <main className="flex-1 px-6 py-6">
        {/* A caixa de destaque do guia ("CaixaDestaque"): fundo `surface-teal`,
            raio de 20 e 12 px entre o ícone, o título e o texto. O espaço vem
            do `gap`: o reset de `index.css` zera a margem de `<h1>` e `<p>`. */}
        <div className="flex flex-col gap-3 rounded-2xl bg-secondary p-6">
          <ShieldCheck size={28} strokeWidth={2} className="text-primary-deep" aria-hidden="true" />
          <h1 className="text-title font-bold text-primary-deep">
            Termo de uso &amp; privacidade
          </h1>
          <p className="text-body text-foreground">
            Antes de continuar, precisamos do seu consentimento para tratar seus dados conforme a LGPD.
          </p>
        </div>

        {/* O cartão do guia (linha, raio de 14 e a sombra de cartão), com a
            rolagem dentro dele. Os parágrafos se afastam pelo `gap`. */}
        {documentos.map((documento) => (
          <div
            key={documento.id}
            className="mt-6 flex max-h-[256px] flex-col gap-3 overflow-x-clip overflow-y-auto rounded-lg border border-border bg-card p-4 text-body-sm text-muted-foreground shadow-sm"
          >
            {/* O título abre o documento inteiro na janela do app, como no
                cadastro e no Perfil. Quando o corpo da versão é só o
                endereço da página (como o painel publica hoje), o link cru dá
                lugar ao aviso; quando é o texto, ele aparece aqui, como antes. */}
            <h2 className="text-card-title font-bold text-foreground">
              <LegalDocumentLink kind={documento.kind} onOpen={openLegalDocument} />{' '}
              <span className="text-caption font-medium text-muted-foreground">
                (v{documento.version}
                {documento.publishedLabel ? ` · ${documento.publishedLabel}` : ''})
              </span>
            </h2>
            {isAddressOnlyBody(documento.body) ? (
              <p>Toque no título para ler o texto completo.</p>
            ) : (
              documento.body.split('\n').map((paragrafo, index) => <p key={index}>{paragrafo}</p>)
            )}
          </div>
        ))}

        {/* Os aceites são linhas de um mesmo grupo: 8 px entre elas, como no guia.
            O erro não é uma linha do grupo: fica a 16 px do último aceite
            (o `gap` mais o `mt-2`), como nas outras telas de entrada. */}
        <form id={FORM_ID} onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-2">
          {documentos.map((documento) => (
            <Controller
              key={documento.id}
              control={control}
              name={`aceitesDocumentos.${documento.id}`}
              render={({ field }) => (
                <Checkbox
                  id={`aceita-${documento.id}`}
                  checked={field.value ?? false}
                  onChange={field.onChange}
                  label={
                    <>
                      Li e concordo com <strong>{LEGAL_DOCUMENT_LABELS[documento.kind]}</strong> do
                      Jornada Supera.
                    </>
                  }
                />
              )}
            />
          ))}
          <Controller
            control={control}
            name="aceitaDadosSensiveis"
            render={({ field }) => (
              <Checkbox
                id="aceita-dados-sensiveis"
                checked={field.value}
                onChange={field.onChange}
                label={
                  <>
                    Autorizo o tratamento dos meus <strong>dados sensíveis de saúde</strong> com a
                    finalidade de me acompanhar no tratamento oncológico.
                  </>
                }
              />
            )}
          />
          {acceptMutation.isError && (
            <InlineError
              className="mt-2"
              title={describeMutationError(acceptMutation.error, 'Não foi possível registrar seu aceite.')}
              description=""
            />
          )}
        </form>
      </main>

      <StickyFooter>
        <Button
          type="submit"
          form={FORM_ID}
          fullWidth
          disabled={!podeContinuar || acceptMutation.isPending}
          loading={acceptMutation.isPending}
        >
          Continuar
        </Button>
      </StickyFooter>
    </div>
  );
}

export default function Lgpd() {
  const navigate = useNavigate();
  const { data: documentos, isLoading, isError, refetch } = useCurrentLegalDocuments();
  const acceptMutation = useAcceptLegalTerms();

  if (isLoading) {
    return <Loading />;
  }

  if (isError) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <StepHeader actions={<SairAction />} className="px-safe-6" />
        <ErrorState
          title="Não foi possível carregar os termos"
          description="Verifique sua conexão e tente novamente."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  // Nenhum termo vigente publicado ainda — não é erro do paciente nem algo
  // que o app resolve sozinho. Não trava o onboarding por uma lacuna de
  // publicação de conteúdo: registra o aceite mesmo assim (a RPC é um no-op
  // sem documento nenhum) e segue.
  if (!documentos || documentos.length === 0) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <StepHeader actions={<SairAction />} className="px-safe-6" />
        <EmptyState
          icon={ShieldCheck}
          title="Termos ainda não publicados"
          description="A clínica ainda não publicou os termos de uso e a política de privacidade vigentes. Você pode continuar — vamos pedir sua confirmação assim que eles forem publicados."
        />
        {/* Sem isto, uma falha da RPC só fazia o botão parar de girar. */}
        {acceptMutation.isError && (
          <div className="px-6 pb-4">
            <InlineError
              title={describeMutationError(acceptMutation.error, 'Não foi possível continuar. Tente novamente.')}
              description=""
            />
          </div>
        )}
        <StickyFooter>
          <Button
            fullWidth
            disabled={acceptMutation.isPending}
            loading={acceptMutation.isPending}
            onClick={() =>
              acceptMutation.mutate(undefined, { onSuccess: () => navigate('/home', { replace: true }) })
            }
          >
            Continuar
          </Button>
        </StickyFooter>
      </div>
    );
  }

  return <LgpdForm documentos={documentos} />;
}
