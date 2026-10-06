import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Download, Trash2, Lock, Phone, Shield, FileText, Ban, PencilLine } from 'lucide-react';
import StepHeader from '../../components/ui/step-header';
import SectionHeading from '../../components/ui/section-heading';
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

/**
 * Os botões de "Seus direitos" trocam o rótulo pelo andamento do pedido ("Pedido
 * de exportação em análise"), que no `text-body` (16 px) do botão não cabe numa
 * linha em tela de 320px. Aqui o rótulo quebra e o botão cresce, sem perder os
 * 48px.
 *
 * Desativado, o rótulo é o único lugar que diz em que pé está o pedido ("Dados
 * prontos em Meus pedidos"), e o `disabled:opacity-50` da base o deixava a
 * ~2,2:1 no claro — mais claro que o `ink-muted`, o limite do guia para texto.
 * Por isso o desativado fica opaco: texto em `ink-muted` (5,5:1 no claro, 7,3:1
 * no escuro), contorno no fio `line` e sem preenchimento, igual nos três botões
 * (o `destructive-soft` também). Continua com cara de inativo, mas legível.
 */
const WRAPPING_BUTTON_CLASS =
  'h-auto min-h-12 py-2.5 whitespace-normal text-center disabled:border-border disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-100';

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
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <StepHeader onBack={() => navigate('/perfil')} meta="Privacidade e dados" />

      {/* Margem lateral de 16px e 32px entre as seções, como no guia. Os
          espaços são `gap`: o reset de `index.css` zera a margem de `<h1>`. */}
      <main className="flex flex-1 flex-col gap-8 px-4 pt-6 pb-[calc(2rem_+_var(--safe-bottom))]">
        <h1 className="text-hero font-bold text-foreground">LGPD</h1>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          {/* O ícone solto, sem pastilha, centrado na linha de 22 px do título (`-my-px`). */}
          <div className="flex items-start gap-3">
            <Shield size={24} strokeWidth={2} className="-my-px shrink-0 text-primary-deep" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <h2 className="text-card-title font-bold text-foreground">Seus consentimentos</h2>
              {/* Revogar pelo app passou a ser possível em 25/09/2026: até
                  então o banco não deixava aceitar de novo a MESMA versão
                  depois da revogação (`uq_consent_records` +
                  `ON CONFLICT DO NOTHING`), e quem revogasse ficava preso no
                  portão. A migration `allow_consent_reacceptance` trocou a
                  restrição por um índice parcial
                  (`uq_consent_records_active … WHERE revoked_at IS NULL`), e o
                  reaceite voltou a funcionar. */}
              <p className="text-body-sm text-muted-foreground">
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
                <ul role="list" className="flex flex-col gap-2">
                  {consentimentos.map((consentimento) => (
                    <li key={consentimento.id} className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-body-sm text-foreground">
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
                          className="inline-flex min-h-12 shrink-0 cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-label font-semibold text-destructive hover:underline"
                        >
                          <Ban size={20} strokeWidth={2} aria-hidden="true" />
                          Revogar
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* Os termos vigentes vêm do banco; sem versão publicada o botão
                  ficava desabilitado sem dizer por quê. O `self-start` impede
                  o botão de esticar na coluna do cartão: a área de toque fica
                  do tamanho do texto. Este link e o "Revogar" acima são o
                  botão pequeno do guia: `text-label` com o ícone de 20 px. */}
              {currentDocuments.isLoading ? (
                <Skeleton className="h-4 w-40" aria-label="Carregando os termos" />
              ) : currentDocuments.isError ? (
                <p className="flex flex-wrap items-center gap-x-2 text-body-sm text-muted-foreground">
                  Não foi possível carregar os termos.
                  <button
                    type="button"
                    onClick={() => void currentDocuments.refetch()}
                    className="inline-flex min-h-12 cursor-pointer items-center border-none bg-transparent p-0 text-label font-semibold text-primary-deep hover:underline"
                  >
                    Tentar de novo
                  </button>
                </p>
              ) : !documentosVigentes || documentosVigentes.length === 0 ? (
                <p className="text-caption font-medium text-muted-foreground">
                  Os termos ainda não foram publicados no app. Você pode lê-los em Documentos, logo abaixo.
                </p>
              ) : (
                <button
                  type="button"
                  className="inline-flex min-h-12 cursor-pointer items-center gap-2 self-start border-none bg-transparent p-0 text-label font-semibold text-primary-deep hover:underline"
                  onClick={() => setLendoTermos(true)}
                >
                  <FileText size={20} strokeWidth={2} aria-hidden="true" />
                  Ler os termos na íntegra
                </button>
              )}
            </>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeading>Documentos</SectionHeading>

          <div className="flex flex-col gap-2">
            <LegalDocumentLinks />
          </div>
        </section>

        {/* O andamento do que já foi pedido vem ANTES dos botões de pedir:
            sem isso o paciente abria pedidos repetidos sem saber que já havia
            um em análise, e nunca lia o motivo de uma recusa — que a LGPD
            (art. 18 §4) existe para lhe entregar. */}
        <section className="flex flex-col gap-3">
          <SectionHeading>Meus pedidos</SectionHeading>

          <DataSubjectRequestList
            requests={pedidos.data ?? []}
            isLoading={pedidos.isLoading}
            isError={pedidos.isError}
            onRetry={() => void pedidos.refetch()}
            onDownload={(id) => void handleBaixar(id)}
            downloadingId={baixandoPedido}
          />
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeading>Seus direitos</SectionHeading>

          {/* O `Card` põe os filhos num `div` interno: o `gap` entre o texto e
              o botão mora no wrapper de dentro, não no `className` do card. O
              título é o de cartão do guia (`text-card-title`, 17/22): o
              `-my-px` centra o ícone de 24 px na linha dele. Os cartões levam
              a sombra única do guia, como os outros desta tela. */}
          <div className="flex flex-col gap-2">
            <Card variant="default" padding="md">
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <Download size={24} strokeWidth={2} className="-my-px shrink-0 text-primary-deep" aria-hidden="true" />
                  <div className="flex flex-col gap-1">
                    <h3 className="text-card-title font-bold text-foreground">Exportar meus dados</h3>
                    <p className="text-body-sm text-muted-foreground">
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
                  fullWidth
                  className={WRAPPING_BUTTON_CLASS}
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
              </div>
            </Card>

            <Card variant="default" padding="md">
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <PencilLine size={24} strokeWidth={2} className="-my-px shrink-0 text-primary-deep" aria-hidden="true" />
                  <div className="flex flex-col gap-1">
                    <h3 className="text-card-title font-bold text-foreground">Corrigir meus dados</h3>
                    <p className="text-body-sm text-muted-foreground">
                      {canDescribeRectification
                        ? 'Viu algum dado errado no seu cadastro? Diga qual é e como deve ficar: a equipe do Centro analisa e corrige.'
                        : 'Viu algum dado errado no seu cadastro? Peça a correção: a equipe do Centro entra em contato para saber o que corrigir.'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  fullWidth
                  className={WRAPPING_BUTTON_CLASS}
                  disabled={hasOpenRectification}
                  onClick={() =>
                    canDescribeRectification ? setIsRectificationSheetOpen(true) : setConfirmingRectification(true)
                  }
                >
                  {hasOpenRectification ? 'Pedido de correção em análise' : 'Pedir correção'}
                </Button>
              </div>
            </Card>

            <Card variant="default" padding="md">
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <Trash2 size={24} strokeWidth={2} className="-my-px shrink-0 text-destructive" aria-hidden="true" />
                  <div className="flex flex-col gap-1">
                    <h3 className="text-card-title font-bold text-foreground">Excluir minha conta</h3>
                    <p className="text-body-sm text-muted-foreground">
                      Abre um pedido formal de exclusão, analisado pela equipe do Centro.
                    </p>
                  </div>
                </div>
                <Button
                  variant="destructive-soft"
                  fullWidth
                  className={WRAPPING_BUTTON_CLASS}
                  disabled={pedidos.isFetching || hasOpenDeletion}
                  onClick={() => setConfirmandoExclusao(true)}
                >
                  {hasOpenDeletion ? 'Pedido de exclusão em análise' : 'Solicitar exclusão de conta'}
                </Button>
              </div>
            </Card>
          </div>
        </section>

        {/* Bloco agrupado em `surface-alt`, como pede o guia. O título é o de
            cartão, a 4 px da frase, como nos outros blocos da tela, e o
            `-my-px` centra o ícone de 24 px na linha de 22 px dele. É um `<h2>`,
            como as faixas das seções vizinhas: quem navega por títulos no leitor
            de tela acha o bloco. */}
        <section className="flex items-start gap-3 rounded-2xl bg-muted p-4">
          <Lock size={24} strokeWidth={2} className="-my-px shrink-0 text-primary-deep" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h2 className="text-card-title font-bold text-foreground">Encarregado de Dados (DPO)</h2>
            <p className="text-body-sm text-muted-foreground">
              Dúvidas sobre o tratamento dos seus dados? Ligue para a Supera Oncologia e peça para
              falar com o Encarregado de Dados.
            </p>
            {/* O e-mail do Encarregado ainda não foi informado pela clínica (o
                que havia aqui era de outro domínio, herdado do protótipo). Até
                lá, o contato é o telefone da clínica. A cor vai no `span`: o
                reset global de `a` anula a cor posta no próprio link. O
                `self-start` mantém a área de toque do tamanho do número. No
                `text-body`, o ícone é o de 24 px dos botões do guia. */}
            <a
              href={CLINIC_PHONE.href}
              className="inline-flex min-h-12 items-center gap-2 self-start text-body font-semibold"
            >
              <Phone size={24} strokeWidth={2} className="shrink-0 text-primary-deep" aria-hidden="true" />
              <span className="text-primary-deep underline underline-offset-2">{CLINIC_PHONE.display}</span>
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
              <li key={documento.id} className="text-body text-foreground">
                <LegalDocumentLink kind={documento.kind} onOpen={openLegalDocument} />{' '}
                <span className="text-muted-foreground">(v{documento.version})</span>
              </li>
            ))}
          </ul>
          <p className="text-caption font-medium text-muted-foreground">
            Toque nos títulos para ler o texto completo.
          </p>
        </div>
      </Modal>
    </div>
  );
}
