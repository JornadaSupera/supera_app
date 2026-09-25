import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Download, Trash2, Lock, Phone, Shield, FileText } from 'lucide-react';
import StepHeader from '../../components/ui/step-header';
import Card from '../../components/ui/card';
import Button from '../../components/ui/button';
import ConfirmDialog from '../../components/ui/confirm-dialog';
import Modal from '../../components/ui/modal';
import Loading from '../../components/ui/loading';
import ErrorState from '../../components/ui/error-state';
import EmptyState from '../../components/ui/empty-state';
import { describeMutationError } from '../../hooks/useAuth';
import {
  useConsentRecords,
  useCurrentLegalDocuments,
  useRequestAccountDeletion,
  useRequestDataExport,
} from '../../hooks/useLegal';
import { useToast } from '../../contexts/ToastContext';
import { LEGAL_DOCUMENT_LABELS, describeConsentDocument } from '../../utils/legal';
import LegalDocumentLinks from './LegalDocumentLinks';
import { CLINIC_PHONE } from '../../lib/clinicContacts';

export default function ProfileLgpd() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [lendoTermos, setLendoTermos] = useState(false);

  const {
    data: consentimentos,
    isLoading: carregandoConsentimentos,
    isError: erroConsentimentos,
    refetch: recarregarConsentimentos,
  } = useConsentRecords();
  const { data: documentosVigentes } = useCurrentLegalDocuments();

  const exportarMutation = useRequestDataExport();
  const excluirMutation = useRequestAccountDeletion();

  function handleExportar() {
    exportarMutation.mutate(undefined, {
      onSuccess: () => {
        showToast('Pedido de exportação registrado. A equipe do Centro vai analisar.', {
          variant: 'success',
        });
      },
      onError: (error) => {
        showToast(describeMutationError(error, 'Não foi possível enviar sua solicitação.'), {
          variant: 'error',
        });
      },
    });
  }

  function handleExcluir() {
    excluirMutation.mutate(undefined, {
      onSuccess: () => {
        setConfirmandoExclusao(false);
        showToast('Pedido de exclusão registrado. A equipe do Centro vai analisar.', {
          variant: 'info',
        });
      },
      onError: (error) => {
        showToast(describeMutationError(error, 'Não foi possível registrar sua solicitação.'), {
          variant: 'error',
        });
      },
    });
  }

  return (
    <div className="flex min-h-[100vh] flex-col bg-background">
      <StepHeader onBack={() => navigate('/perfil')} meta="Privacidade e dados" />

      <main className="flex-1 px-6 pt-6 pb-8">
        <h1 className="mb-6 text-[24px] font-semibold leading-[1.25] tracking-[-0.4px] text-foreground">
          LGPD
        </h1>

        <section className="mb-6 rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-start gap-3">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-primary">
              <Shield size={16} strokeWidth={2} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[14px] font-semibold text-foreground">Seus consentimentos</h2>
              {/* Revogar pelo app ainda não existe: `revoke_consent` existe,
                  mas o banco não deixa aceitar de novo a mesma versão depois
                  (`uq_consent_records` + `ON CONFLICT DO NOTHING`), e quem
                  revogasse ficaria preso no portão. Até lá, o caminho é o
                  Encarregado de Dados, cujo contato fica no fim da tela. */}
              <p className="mt-1 text-[12px] leading-[1.5] text-muted-foreground">
                Para revogar um consentimento, fale com o Encarregado de Dados (DPO) — o contato
                está no fim desta página.
              </p>
            </div>
          </div>

          {carregandoConsentimentos && <Loading inline label="Carregando consentimentos…" />}

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
                <ul className="mb-3 flex flex-col gap-2">
                  {consentimentos.map((consentimento) => (
                    <li
                      key={consentimento.id}
                      className="text-[12px] leading-[1.4] text-foreground before:content-['·_']"
                    >
                      {describeConsentDocument(
                        consentimento.tipoDocumento,
                        consentimento.versaoDocumento
                      )}{' '}
                      — aceito em {consentimento.aceitoLabel}
                      {consentimento.revogadoEm && (
                        <span className="text-muted-foreground"> · revogado</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                disabled={!documentosVigentes || documentosVigentes.length === 0}
                className="inline-flex min-h-[44px] cursor-pointer items-center gap-[6px] border-none bg-transparent p-0 text-[11px] font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                onClick={() => setLendoTermos(true)}
              >
                <FileText size={14} strokeWidth={2} aria-hidden="true" />
                Ler os termos na íntegra
              </button>
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
              <Button
                variant="outline"
                size="sm"
                fullWidth
                onClick={handleExportar}
                loading={exportarMutation.isPending}
                disabled={exportarMutation.isPending}
              >
                Solicitar exportação
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
                onClick={() => setConfirmandoExclusao(true)}
              >
                Solicitar exclusão de conta
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

      <Modal
        open={lendoTermos}
        onClose={() => setLendoTermos(false)}
        title="Termos vigentes"
        titleIcon={FileText}
      >
        {(documentosVigentes ?? []).map((documento) => (
          <div key={documento.id} className="mb-5 last:mb-0">
            <h3 className="mb-2 text-[14px] font-semibold text-foreground">
              {LEGAL_DOCUMENT_LABELS[documento.tipo]}{' '}
              <span className="font-normal text-muted-foreground">(v{documento.versao})</span>
            </h3>
            {documento.corpo.split('\n').map((paragrafo, index) => (
              <p key={index} className="mt-2 text-[12px] leading-[1.6] text-muted-foreground">
                {paragrafo}
              </p>
            ))}
          </div>
        ))}
      </Modal>
    </div>
  );
}
