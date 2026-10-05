import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Download, Trash2, Lock, Phone, Shield, FileText, Ban, FileClock, PencilLine } from 'lucide-react';
import StepHeader from '../../components/ui/step-header';
import Card from '../../components/ui/card';
import Button from '../../components/ui/button';
import ConfirmDialog from '../../components/ui/confirm-dialog';
import Modal from '../../components/ui/modal';
import Skeleton from '../../components/ui/skeleton';
import ErrorState from '../../components/ui/error-state';
import EmptyState from '../../components/ui/empty-state';
import { describeMutationError } from '../../hooks/useAuth';
import {
  useConsentRecords,
  useCurrentLegalDocuments,
  useLegalDocumentOpener,
  useRequestAccountDeletion,
  useRequestDataExport,
} from '../../hooks/useLegal';
import { useToast } from '../../contexts/ToastContext';
import { describeConsentDocument } from '../../utils/legal';
import { canDownloadExport } from '../../utils/dataSubject';
import LegalDocumentLink from '../../components/LegalDocumentLink';
import LegalDocumentLinks from './LegalDocumentLinks';
import DataSubjectRequestList from './DataSubjectRequestList';
import RectificationRequestSheet from './RectificationRequestSheet';
import {
  useDownloadMyDataExport,
  useMyDataSubjectRequests,
  useRectificationDetailsSupport,
  useRequestDataRectification,
  useRevokeConsent,
} from '../../hooks/useDataSubject';
import { CLINIC_PHONE } from '../../lib/clinicContacts';
import type { DataSubjectRequestType } from '../../types';

export default function ProfileLgpd() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [lendoTermos, setLendoTermos] = useState(false);
  const [revogandoConsentimento, setRevogandoConsentimento] = useState<string | null>(null);
  const [baixandoPedido, setBaixandoPedido] = useState<string | null>(null);
  const [confirmingRectification, setConfirmingRectification] = useState(false);
  const [isRectificationSheetOpen, setIsRectificationSheetOpen] = useState(false);

  const {
    data: consentimentos,
    isLoading: carregandoConsentimentos,
    isError: erroConsentimentos,
    refetch: recarregarConsentimentos,
  } = useConsentRecords();
  const currentDocuments = useCurrentLegalDocuments();
  const documentosVigentes = currentDocuments.data;
  const openLegalDocument = useLegalDocumentOpener();

  const exportarMutation = useRequestDataExport();
  const excluirMutation = useRequestAccountDeletion();

  const pedidos = useMyDataSubjectRequests();
  const baixarMutation = useDownloadMyDataExport();
  const revogarMutation = useRevokeConsent();
  const rectification = useRequestDataRectification();
  // Com o banco pronto (item [34]), o pedido de correção diz o que corrigir.
  // Antes disso, ou se a consulta falhar, fica a confirmação simples de hoje.
  const rectificationDetails = useRectificationDetailsSupport();
  const canDescribeRectification = rectificationDetails.data === true;

  // O banco aceita pedidos repetidos; a tela avisa que já há um em andamento.
  const hasOpenRequest = (type: DataSubjectRequestType) =>
    (pedidos.data ?? []).some(
      (request) => request.type === type && (request.status === 'requested' || request.status === 'under_review')
    );
  const hasOpenRectification = hasOpenRequest('rectification');
  const hasOpenExport = hasOpenRequest('portability');
  const hasOpenDeletion = hasOpenRequest('deletion');
  // Com um pacote pronto para baixar em "Meus pedidos", um pedido novo só
  // repetiria o que já está liberado.
  const hasReadyExport = (pedidos.data ?? []).some((request) => canDownloadExport(request));

  // Trava contra o toque duplo. O segundo toque chega antes de a tela
  // desativar o botão, e o banco aceita pedidos repetidos — saíam dois. Em
  // ref, e não em estado, porque precisa valer já no toque seguinte, antes de
  // qualquer render.
  const requestsInFlight = useRef(new Set<DataSubjectRequestType>());

  function startRequest(type: DataSubjectRequestType): boolean {
    if (requestsInFlight.current.has(type)) return false;
    requestsInFlight.current.add(type);
    return true;
  }

  function finishRequest(type: DataSubjectRequestType) {
    requestsInFlight.current.delete(type);
  }

  function handleRequestRectification(note: string | null) {
    if (!startRequest('rectification')) return;

    rectification.mutate(note, {
      onSettled: () => finishRequest('rectification'),
      onSuccess: () => {
        setConfirmingRectification(false);
        setIsRectificationSheetOpen(false);
        showToast(
          note
            ? 'Pedido de correção enviado. A equipe do Centro vai analisar e corrigir o seu cadastro.'
            : 'Pedido de correção registrado. A equipe do Centro vai entrar em contato com você.',
          { variant: 'success' }
        );
      },
      onError: (error) => {
        showToast(describeMutationError(error, 'Não foi possível registrar o pedido de correção.'), {
          variant: 'error',
        });
      },
    });
  }

  function handleExportar() {
    if (!startRequest('portability')) return;

    exportarMutation.mutate(undefined, {
      onSettled: () => finishRequest('portability'),
      onSuccess: () => {
        showToast('Pedido de exportação registrado. A equipe do Centro vai analisar.', {
          variant: 'success',
        });
        void pedidos.refetch();
      },
      onError: (error) => {
        showToast(describeMutationError(error, 'Não foi possível enviar sua solicitação.'), {
          variant: 'error',
        });
      },
    });
  }

  function handleExcluir() {
    if (!startRequest('deletion')) return;

    excluirMutation.mutate(undefined, {
      onSettled: () => finishRequest('deletion'),
      onSuccess: () => {
        setConfirmandoExclusao(false);
        showToast('Pedido de exclusão registrado. A equipe do Centro vai analisar.', {
          variant: 'info',
        });
        void pedidos.refetch();
      },
      onError: (error) => {
        showToast(describeMutationError(error, 'Não foi possível registrar sua solicitação.'), {
          variant: 'error',
        });
      },
    });
  }

  async function handleBaixar(requestId: string) {
    setBaixandoPedido(requestId);
    try {
      const resultado = await baixarMutation.mutateAsync(requestId);
      showToast(
        resultado === 'saved'
          ? 'Seus dados foram salvos na pasta de Documentos do aparelho.'
          : 'Seus dados foram baixados.',
        { variant: 'success' }
      );
    } catch (error) {
      showToast(describeMutationError(error, 'Não foi possível baixar seus dados.'), { variant: 'error' });
    } finally {
      setBaixandoPedido(null);
    }
  }

  async function handleRevogar() {
    if (!revogandoConsentimento) return;

    try {
      await revogarMutation.mutateAsync(revogandoConsentimento);
      // Sem consentimento vigente o portão de `RequireAuth` devolve a pessoa ao
      // aceite — que agora funciona, porque o banco passou a permitir o
      // reaceite da mesma versão (25/09/2026).
      showToast('Consentimento revogado. Para continuar usando o app, você vai precisar aceitá-lo de novo.', {
        variant: 'info',
      });
    } catch (error) {
      showToast(describeMutationError(error, 'Não foi possível revogar este consentimento.'), { variant: 'error' });
    } finally {
      setRevogandoConsentimento(null);
    }
  }

  const consentimentoEmRevogacao = (consentimentos ?? []).find((c) => c.id === revogandoConsentimento) ?? null;

  return (
    <div className="flex min-h-[100vh] flex-col bg-background">
      <StepHeader onBack={() => navigate('/perfil')} meta="Privacidade e dados" />

      <main className="flex-1 px-6 pt-6 pb-8">
        <h1 className="mb-6 text-[24px] font-semibold leading-[1.25] tracking-[-0.4px] text-foreground">
          LGPD
        </h1>

        <section className="mb-6 rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-start gap-3">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-primary-deep">
              <Shield size={16} strokeWidth={2} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[14px] font-semibold text-foreground">Seus consentimentos</h2>
              {/* Revogar pelo app passou a ser possível em 25/09/2026: até
                  então o banco não deixava aceitar de novo a MESMA versão
                  depois da revogação (`uq_consent_records` +
                  `ON CONFLICT DO NOTHING`), e quem revogasse ficava preso no
                  portão. A migration `allow_consent_reacceptance` trocou a
                  restrição por um índice parcial
                  (`uq_consent_records_active … WHERE revoked_at IS NULL`), e o
                  reaceite voltou a funcionar. */}
              <p className="mt-1 text-[12px] leading-[1.5] text-muted-foreground">
                Você pode revogar um consentimento a qualquer momento. Sem ele, o app deixa de abrir
                os seus dados até você aceitá-lo de novo.
              </p>
            </div>
          </div>

          {carregandoConsentimentos && (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando consentimentos">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          )}

          {!carregandoConsentimentos && erroConsentimentos && (
            <ErrorState
              className="min-h-0 py-4"
              title="Não foi possível carregar seus consentimentos"
              onRetry={() => void recarregarConsentimentos()}
            />
          )}

          {!carregandoConsentimentos && !erroConsentimentos && consentimentos && (
            <>
              {consentimentos.length === 0 ? (
                <EmptyState
                  className="min-h-0 py-4"
                  icon={Shield}
                  title="Nenhum consentimento registrado ainda"
                  description="Assim que você aceitar os termos no aplicativo, eles aparecem aqui."
                />
              ) : (
                <ul role="list" className="mb-3 flex flex-col gap-2">
                  {consentimentos.map((consentimento) => (
                    <li key={consentimento.id} className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-[12px] leading-[1.4] text-foreground">
                        {describeConsentDocument(
                          consentimento.documentKind,
                          consentimento.documentVersion
                        )}{' '}
                        — aceito em {consentimento.acceptedLabel}
                        {consentimento.revokedAt && (
                          <span className="text-muted-foreground"> · revogado</span>
                        )}
                      </p>
                      {!consentimento.revokedAt && (
                        <button
                          type="button"
                          onClick={() => setRevogandoConsentimento(consentimento.id)}
                          className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-[11px] font-medium text-destructive hover:underline"
                        >
                          <Ban size={12} strokeWidth={2} aria-hidden="true" />
                          Revogar
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* Os termos vigentes vêm do banco; sem versão publicada o botão
                  ficava desabilitado sem dizer por quê. */}
              {currentDocuments.isLoading ? (
                <Skeleton className="h-4 w-40" aria-label="Carregando os termos" />
              ) : currentDocuments.isError ? (
                <p className="flex flex-wrap items-center gap-x-2 text-[11px] leading-[1.5] text-muted-foreground">
                  Não foi possível carregar os termos.
                  <button
                    type="button"
                    onClick={() => void currentDocuments.refetch()}
                    className="inline-flex min-h-[44px] cursor-pointer items-center border-none bg-transparent p-0 font-medium text-primary-deep hover:underline"
                  >
                    Tentar de novo
                  </button>
                </p>
              ) : !documentosVigentes || documentosVigentes.length === 0 ? (
                <p className="text-[11px] leading-[1.5] text-muted-foreground">
                  Os termos ainda não foram publicados no app. Você pode lê-los em Documentos, logo abaixo.
                </p>
              ) : (
                <button
                  type="button"
                  className="inline-flex min-h-[44px] cursor-pointer items-center gap-[6px] border-none bg-transparent p-0 text-[11px] font-medium text-primary-deep hover:underline"
                  onClick={() => setLendoTermos(true)}
                >
                  <FileText size={14} strokeWidth={2} aria-hidden="true" />
                  Ler os termos na íntegra
                </button>
              )}
            </>
          )}
        </section>

        <section className="mb-6">
          <h2 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
            Documentos
          </h2>

          <div className="flex flex-col gap-2">
            <LegalDocumentLinks />
          </div>
        </section>

        {/* O andamento do que já foi pedido vem ANTES dos botões de pedir:
            sem isso o paciente abria pedidos repetidos sem saber que já havia
            um em análise, e nunca lia o motivo de uma recusa — que a LGPD
            (art. 18 §4) existe para lhe entregar. */}
        <section className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
            <FileClock size={14} strokeWidth={2} aria-hidden="true" />
            Meus pedidos
          </h2>

          <DataSubjectRequestList
            requests={pedidos.data ?? []}
            isLoading={pedidos.isLoading}
            isError={pedidos.isError}
            onRetry={() => void pedidos.refetch()}
            onDownload={(id) => void handleBaixar(id)}
            downloadingId={baixandoPedido}
          />
        </section>

        <section className="mb-6">
          <h2 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
            Seus direitos
          </h2>

          <div className="flex flex-col gap-2">
            <Card variant="default" elevation="none" padding="sm" className="flex flex-col items-stretch gap-3">
              <div className="flex items-start gap-2">
                <Download
                  size={16}
                  strokeWidth={2}
                  className="mt-[2px] shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="text-[14px] font-medium text-foreground">Exportar meus dados</h3>
                  <p className="mt-[2px] text-[11px] leading-[1.5] text-muted-foreground">
                    Peça uma cópia dos seus dados. O pedido fica registrado para a equipe do
                    Centro analisar.
                  </p>
                </div>
              </div>
              {/* Desativado também enquanto a lista de pedidos se atualiza: logo
                  depois do envio, é ela que passa a dizer que já há um pedido em
                  andamento — sem isso, um segundo toque no meio criava outro. */}
              <Button
                variant="outline"
                size="sm"
                fullWidth
                hitArea
                onClick={handleExportar}
                loading={exportarMutation.isPending}
                disabled={exportarMutation.isPending || pedidos.isFetching || hasOpenExport || hasReadyExport}
              >
                {hasOpenExport
                  ? 'Pedido de exportação em análise'
                  : hasReadyExport
                    ? 'Dados prontos em Meus pedidos'
                    : 'Solicitar exportação'}
              </Button>
            </Card>

            <Card variant="default" elevation="none" padding="sm" className="flex flex-col items-stretch gap-3">
              <div className="flex items-start gap-2">
                <PencilLine
                  size={16}
                  strokeWidth={2}
                  className="mt-[2px] shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="text-[14px] font-medium text-foreground">Corrigir meus dados</h3>
                  <p className="mt-[2px] text-[11px] leading-[1.5] text-muted-foreground">
                    {canDescribeRectification
                      ? 'Viu algum dado errado no seu cadastro? Diga qual é e como deve ficar: a equipe do Centro analisa e corrige.'
                      : 'Viu algum dado errado no seu cadastro? Peça a correção: a equipe do Centro entra em contato para saber o que corrigir.'}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                fullWidth
                hitArea
                disabled={hasOpenRectification}
                onClick={() =>
                  canDescribeRectification ? setIsRectificationSheetOpen(true) : setConfirmingRectification(true)
                }
              >
                {hasOpenRectification ? 'Pedido de correção em análise' : 'Pedir correção'}
              </Button>
            </Card>

            <Card variant="default" elevation="none" padding="sm" className="flex flex-col items-stretch gap-3">
              <div className="flex items-start gap-2">
                <Trash2
                  size={16}
                  strokeWidth={2}
                  className="mt-[2px] shrink-0 text-destructive"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="text-[14px] font-medium text-foreground">Excluir minha conta</h3>
                  <p className="mt-[2px] text-[11px] leading-[1.5] text-muted-foreground">
                    Abre um pedido formal de exclusão, analisado pela equipe do Centro.
                  </p>
                </div>
              </div>
              <Button
                variant="destructive-soft"
                size="sm"
                fullWidth
                hitArea
                disabled={pedidos.isFetching || hasOpenDeletion}
                onClick={() => setConfirmandoExclusao(true)}
              >
                {hasOpenDeletion ? 'Pedido de exclusão em análise' : 'Solicitar exclusão de conta'}
              </Button>
            </Card>
          </div>
        </section>

        <section className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-[color-mix(in_srgb,var(--color-muted)_30%,transparent)] p-4">
          <Lock size={16} strokeWidth={2} className="mt-[2px] shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="mb-1 text-[12px] font-medium text-foreground">Encarregado de Dados (DPO)</p>
            <p className="mb-2 text-[12px] leading-[1.5] text-muted-foreground">
              Dúvidas sobre o tratamento dos seus dados? Ligue para a Supera Oncologia e peça para
              falar com o Encarregado de Dados.
            </p>
            {/* O e-mail do Encarregado ainda não foi informado pela clínica (o
                que havia aqui era de outro domínio, herdado do protótipo). Até
                lá, o contato é o telefone da clínica. A cor vai no `span`: o
                reset global de `a` anula a cor posta no próprio link. */}
            <a href={CLINIC_PHONE.href} className="inline-flex min-h-[44px] items-center gap-[6px] text-[12px] font-medium">
              <Phone size={14} strokeWidth={2} className="text-[var(--color-supera-seguranca)]" aria-hidden="true" />
              <span className="text-[var(--color-supera-seguranca)] underline underline-offset-2">
                {CLINIC_PHONE.display}
              </span>
            </a>
          </div>
        </section>
      </main>

      <ConfirmDialog
        open={confirmandoExclusao}
        title="Excluir minha conta"
        description="Isso abre um pedido formal de exclusão para a equipe do Centro. Enquanto ele não for confirmado, você continua com acesso normal — mas essa é uma solicitação séria, não um teste."
        confirmLabel="Solicitar exclusão"
        destructive
        titleIcon={Trash2}
        loading={excluirMutation.isPending}
        onConfirm={handleExcluir}
        onCancel={() => setConfirmandoExclusao(false)}
      />

      <ConfirmDialog
        open={confirmingRectification}
        title="Pedir correção dos seus dados?"
        description="Isso abre um pedido formal de correção para a equipe do Centro, que vai entrar em contato para saber o que precisa ser corrigido. Nada muda no seu cadastro até lá."
        confirmLabel="Pedir correção"
        titleIcon={PencilLine}
        loading={rectification.isPending}
        onConfirm={() => handleRequestRectification(null)}
        onCancel={() => setConfirmingRectification(false)}
      />

      <RectificationRequestSheet
        open={isRectificationSheetOpen}
        loading={rectification.isPending}
        onSubmit={handleRequestRectification}
        onClose={() => setIsRectificationSheetOpen(false)}
      />

      <ConfirmDialog
        open={revogandoConsentimento !== null}
        title="Revogar este consentimento?"
        description={
          consentimentoEmRevogacao
            ? `Você revoga o aceite de ${describeConsentDocument(consentimentoEmRevogacao.documentKind, consentimentoEmRevogacao.documentVersion)}. Sem ele, o app deixa de abrir os seus dados até você aceitá-lo de novo — e isso pode ser feito na hora, pelo próprio aplicativo.`
            : ''
        }
        confirmLabel="Revogar consentimento"
        destructive
        titleIcon={Ban}
        loading={revogarMutation.isPending}
        onConfirm={() => void handleRevogar()}
        onCancel={() => setRevogandoConsentimento(null)}
      />

      <Modal
        open={lendoTermos}
        onClose={() => setLendoTermos(false)}
        title="Termos vigentes"
        titleIcon={FileText}
      >
        {/* Tocar no título abre o documento inteiro na janela do app, como no
            aceite do cadastro. O corpo da versão não aparece aqui: hoje ele é
            só o endereço da página, e um link cru não serve para ler. O vão de
            24px deixa as áreas de toque dos títulos encostadas, sem se
            sobrepor. */}
        <div className="flex flex-col gap-6">
          <ul role="list" className="flex flex-col gap-6">
            {(documentosVigentes ?? []).map((documento) => (
              <li key={documento.id} className="text-[14px] leading-[1.5] text-foreground">
                <LegalDocumentLink kind={documento.kind} onOpen={openLegalDocument} />{' '}
                <span className="text-muted-foreground">(v{documento.version})</span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] leading-[1.4] text-muted-foreground">
            Toque nos títulos para ler o texto completo.
          </p>
        </div>
      </Modal>
    </div>
  );
}
