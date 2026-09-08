import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { z } from 'zod';
import Checkbox from '../../components/ui/checkbox';
import Button from '../../components/ui/button';
import Header from '../../components/ui/header';
import Loading from '../../components/ui/loading';
import ErrorState from '../../components/ui/error-state';
import EmptyState from '../../components/ui/empty-state';
import { useCurrentLegalDocuments, useAcceptLegalTerms } from '../../hooks/useLegal';
import { describeMutationError, useSignOut } from '../../hooks/useAuth';
import type { LegalDocumentKind, LegalDocumentVersion } from '../../types';

// O checkbox de "dados sensíveis de saúde" não tem `kind` próprio no banco
// (só existem `terms_of_use` e `privacy_policy`) — continua obrigatório na
// UI, mas o aceite dele fica coberto pela política de privacidade quando
// publicada, sem linha própria em `consent_records`.
const DOCUMENT_LABELS: Record<LegalDocumentKind, string> = {
  terms_of_use: 'Termos de Uso',
  privacy_policy: 'Política de Privacidade',
};

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
// vínculo).
function SairAction() {
  const signOutMutation = useSignOut();
  return (
    <button
      type="button"
      onClick={() => signOutMutation.mutate()}
      className="min-h-[44px] cursor-pointer border-none bg-transparent px-2 text-[13px] font-medium text-primary"
    >
      Sair
    </button>
  );
}

function LgpdForm({ documentos }: { documentos: LegalDocumentVersion[] }) {
  const navigate = useNavigate();
  const acceptMutation = useAcceptLegalTerms();

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
      <Header
        variant="step"
        sticky
        bordered
        blurred
        actions={<SairAction />}
        // Header.jsx (ainda não migrado) declara title/subtitle sem valor
        // padrão, então o TS as infere como obrigatórias mesmo não sendo
        // usadas na variante "step" — undefined satisfaz o shape inferido
        // sem alterar o componente legado.
        title={undefined}
        subtitle={undefined}
      />

      <main className="flex-1 px-6 py-5">
        <div className="rounded-xl bg-[color-mix(in_srgb,var(--color-supera-uniao)_10%,transparent)] p-4">
          <ShieldCheck
            size={24}
            strokeWidth={2}
            className="text-[var(--color-supera-uniao)]"
            aria-hidden="true"
          />
          <h1 className="mt-3 text-[20px] font-semibold tracking-[-0.4px] leading-[1.3]">
            Termo de uso &amp; privacidade
          </h1>
          <p className="mt-[6px] text-[14px] leading-[1.6] text-muted-foreground">
            Antes de continuar, precisamos do seu consentimento para tratar seus dados conforme a LGPD.
          </p>
        </div>

        {documentos.map((documento) => (
          <div
            key={documento.id}
            className="mt-5 max-h-[256px] overflow-y-auto rounded-lg border border-border bg-card p-4 text-[12px] leading-[1.6] text-muted-foreground [&>p]:mt-3"
          >
            <h2 className="text-[14px] font-semibold text-foreground">
              {DOCUMENT_LABELS[documento.tipo]}{' '}
              <span className="font-normal text-muted-foreground">
                (v{documento.versao}
                {documento.publicadoLabel ? ` · ${documento.publicadoLabel}` : ''})
              </span>
            </h2>
            {documento.corpo.split('\n').map((paragrafo, index) => (
              <p key={index}>{paragrafo}</p>
            ))}
          </div>
        ))}

        <form id={FORM_ID} onSubmit={handleSubmit(onSubmit)} className="mt-5 flex flex-col gap-3">
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
                      Li e concordo com <strong>{DOCUMENT_LABELS[documento.tipo]}</strong> do
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
            <p role="alert" className="text-[12px] text-destructive">
              {describeMutationError(acceptMutation.error, 'Não foi possível registrar seu aceite.')}
            </p>
          )}
        </form>
      </main>

      <footer className="sticky bottom-0 border-t border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] px-6 py-4 backdrop-blur-[8px]">
        <Button
          type="submit"
          form={FORM_ID}
          fullWidth
          iconRight={ChevronRight}
          disabled={!podeContinuar || acceptMutation.isPending}
          loading={acceptMutation.isPending}
        >
          Continuar
        </Button>
      </footer>
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
        <Header variant="step" sticky bordered blurred actions={<SairAction />} title={undefined} subtitle={undefined} />
        <ErrorState
          title="Não foi possível carregar os termos"
          description="Verifique sua conexão e tente novamente."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  // Nenhum termo vigente publicado ainda — não é erro do paciente nem algo
  // que o app resolve sozinho (ver Análise do módulo). Não trava o onboarding
  // por uma lacuna de publicação de conteúdo: registra o aceite mesmo assim
  // (a RPC é um no-op sem documento nenhum) e segue.
  if (!documentos || documentos.length === 0) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <Header variant="step" sticky bordered blurred actions={<SairAction />} title={undefined} subtitle={undefined} />
        <EmptyState
          icon={ShieldCheck}
          title="Termos ainda não publicados"
          description="A clínica ainda não publicou os termos de uso e a política de privacidade vigentes. Você pode continuar — vamos pedir sua confirmação assim que eles forem publicados."
        />
        <footer className="sticky bottom-0 border-t border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] px-6 py-4 backdrop-blur-[8px]">
          <Button
            fullWidth
            iconRight={ChevronRight}
            disabled={acceptMutation.isPending}
            loading={acceptMutation.isPending}
            onClick={() =>
              acceptMutation.mutate(undefined, { onSuccess: () => navigate('/home', { replace: true }) })
            }
          >
            Continuar
          </Button>
        </footer>
      </div>
    );
  }

  return <LgpdForm documentos={documentos} />;
}
