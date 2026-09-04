import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { Download, Trash2, Lock, Mail, Shield, FileText } from 'lucide-react';
import Header from '../../components/ui/header';
import Card from '../../components/ui/card';
import Button from '../../components/ui/button';
import ConfirmDialog from '../../components/ui/confirm-dialog';
import { solicitarExportacaoDados, solicitarExclusaoConta } from '../../services/mockApi';
import { describeMutationError } from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';

export default function ProfileLgpd() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const exportarMutation = useMutation({
    mutationFn: solicitarExportacaoDados,
    onSuccess: () => {
      showToast('Solicitação enviada! Você vai receber seus dados por e-mail em breve.', {
        variant: 'success',
      });
    },
    onError: (error) => {
      showToast(describeMutationError(error, 'Não foi possível enviar sua solicitação.'), {
        variant: 'error',
      });
    },
  });

  const excluirMutation = useMutation({
    mutationFn: solicitarExclusaoConta,
    onSuccess: () => {
      setConfirmandoExclusao(false);
      showToast('Solicitação recebida. Nossa equipe vai entrar em contato para confirmar.', {
        variant: 'info',
      });
    },
    onError: (error) => {
      showToast(describeMutationError(error, 'Não foi possível registrar sua solicitação.'), {
        variant: 'error',
      });
    },
  });

  function handleLerTermos() {
    showToast('Documento completo não está disponível nesta demonstração.', {
      variant: 'info',
    });
  }

  return (
    <div className="flex min-h-[100vh] flex-col bg-background">
      <Header
        variant="step"
        sticky
        bordered
        blurred
        onBack={() => navigate('/perfil')}
        meta="Privacidade e dados"
        // Header.jsx declares these with no default, so its JS-inferred type
        // marks them required even though the "step" variant never renders
        // them (see Header.jsx's `isStep` branch).
        title={undefined}
        subtitle={undefined}
        actions={undefined}
      />

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
              <p className="mt-1 text-[12px] leading-[1.5] text-muted-foreground">
                Aceitos em <strong className="text-foreground">12/04/2026</strong> no primeiro
                acesso. Você pode revogar a qualquer momento — isso interrompe o acompanhamento
                pelo app.
              </p>
            </div>
          </div>
          <ul className="mb-3 flex flex-col gap-2">
            <li className="text-[12px] leading-[1.4] text-foreground before:content-['·_']">
              Termo de consentimento informado
            </li>
            <li className="text-[12px] leading-[1.4] text-foreground before:content-['·_']">
              Política de privacidade (v1.7)
            </li>
            <li className="text-[12px] leading-[1.4] text-foreground before:content-['·_']">
              Tratamento de dados sensíveis de saúde
            </li>
          </ul>
          <button
            type="button"
            className="inline-flex min-h-[44px] cursor-pointer items-center gap-[6px] border-none bg-transparent p-0 text-[11px] font-medium text-primary hover:underline"
            onClick={handleLerTermos}
          >
            <FileText size={14} strokeWidth={2} aria-hidden="true" />
            Ler os termos na íntegra
          </button>
        </section>

        <section className="mb-6">
          <h2 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
            Seus direitos
          </h2>

          <div className="flex flex-col gap-2">
            <Card variant="default" padding="sm" flat className="flex flex-col items-stretch gap-3">
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
                    Receba uma cópia completa em PDF no e-mail cadastrado.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                fullWidth
                onClick={() => exportarMutation.mutate()}
                loading={exportarMutation.isPending}
                disabled={exportarMutation.isPending}
              >
                Solicitar exportação
              </Button>
            </Card>

            <Card variant="default" padding="sm" flat className="flex flex-col items-stretch gap-3">
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
                    Remove seu acesso e anonimiza seus dados conforme a LGPD.
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
              Dúvidas sobre o tratamento dos seus dados? Fale com nosso DPO.
            </p>
            <a
              href="mailto:dpo@centrooncologiasc.com.br"
              className="inline-flex min-h-[44px] items-center gap-[6px] text-[12px] font-medium text-primary hover:underline"
            >
              <Mail size={14} strokeWidth={2} aria-hidden="true" />
              dpo@centrooncologiasc.com.br
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
        onConfirm={() => excluirMutation.mutate()}
        onCancel={() => setConfirmandoExclusao(false)}
      />
    </div>
  );
}
