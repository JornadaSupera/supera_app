import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  UserPlus,
  Smartphone,
  Mail,
  Check,
  Lock,
  ShieldCheck,
  History,
  Hourglass,
} from 'lucide-react';
import Header from '../../components/ui/header';
import Avatar from '../../components/ui/avatar';
import Card from '../../components/ui/card';
import Badge from '../../components/ui/badge';
import Button from '../../components/ui/button';
import Modal from '../../components/ui/modal';
import { maskContact } from '../../utils/contact';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import Loading from '../../components/ui/loading';
import { useToast } from '../../contexts/ToastContext';
import {
  useCancelCaregiverInvitation,
  useCaregiver,
  useRevokeCaregiverLink,
} from '../../hooks/useCaregiver';
import { describeMutationError } from '../../hooks/useAuth';
import { cn } from '../../lib/utils';
import InviteCaregiverModal from './InviteCaregiverModal';
import type { CaregiverContactMethod, CaregiverHistoryEvent } from '../../types';

// Texto fixo de UI, não dado: descreve o que a RLS já impõe no banco (o
// cuidador lê agenda, orientações, chat e diário do tutelado; não alcança
// LGPD, exportação, exclusão nem o próprio vínculo). Vive aqui, e não numa
// tabela, porque não há coluna que o descreva — e inventar uma seria pior.
const PERMISSOES_PODE = [
  'Ver a agenda e receber os lembretes',
  'Ver as orientações enviadas pela equipe',
  'Acompanhar e conversar no chat com a equipe',
  'Ver e ajudar a registrar o diário',
];

const PERMISSOES_NAO_PODE = [
  'Ver conteúdo sigiloso (ex.: sessões de psicologia)',
  'Revogar a LGPD, exportar ou excluir a sua conta',
  'Trocar a sua senha ou gerenciar o próprio vínculo',
  'Favoritar ou marcar orientações como lidas por você',
];

const EVENTO_LABEL: Record<CaregiverHistoryEvent, string> = {
  convite_enviado: 'Convite enviado',
  convite_cancelado: 'Convite cancelado',
  vinculo_ativo: 'Vínculo ativo',
  revogado: 'Vínculo revogado',
};

// Cor do marcador (::before) da linha do tempo, por tipo de evento.
const HISTORICO_DOT_CLASS: Record<CaregiverHistoryEvent, string> = {
  convite_enviado: 'before:bg-[var(--color-supera-uniao)]',
  convite_cancelado: 'before:bg-muted-foreground',
  vinculo_ativo: 'before:bg-[var(--color-supera-empatia)]',
  revogado: 'before:bg-muted-foreground',
};

function IconeCanal({ canal }: { canal: CaregiverContactMethod | null }) {
  const Icon = canal === 'email' ? Mail : Smartphone;

  return <Icon size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />;
}

export default function CaregiverManage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [modalAberto, setModalAberto] = useState(false);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);

  const { data: dadosCuidador, isLoading, isError, refetch } = useCaregiver();

  const revokeMutation = useRevokeCaregiverLink();
  const cancelMutation = useCancelCaregiverInvitation();

  if (isLoading) return <Loading />;

  if (isError || !dadosCuidador) {
    return (
      <ErrorState
        title="Não foi possível carregar os dados do acompanhante"
        onRetry={() => void refetch()}
      />
    );
  }

  const { atual: cuidadorAtual, convitePendente, historico } = dadosCuidador;

  function handleRevogar() {
    if (!cuidadorAtual) return;

    revokeMutation.mutate(cuidadorAtual.id, {
      onSuccess: () => {
        setConfirmandoRemocao(false);
        showToast('Vínculo revogado. O acesso foi encerrado.', { variant: 'success' });
      },
      onError: (erro) => {
        setConfirmandoRemocao(false);
        showToast(describeMutationError(erro, 'Não foi possível remover o vínculo.'), {
          variant: 'error',
        });
      },
    });
  }

  function handleCancelarConvite() {
    if (!convitePendente) return;

    cancelMutation.mutate(convitePendente.id, {
      onSuccess: () => {
        setConfirmandoCancelamento(false);
        showToast('Convite cancelado. O código não vale mais.', { variant: 'success' });
      },
      onError: (erro) => {
        setConfirmandoCancelamento(false);
        showToast(describeMutationError(erro, 'Não foi possível cancelar o convite.'), {
          variant: 'error',
        });
      },
    });
  }

  const meta = cuidadorAtual
    ? 'Acompanhante vinculado'
    : convitePendente
      ? 'Convite pendente'
      : 'Acompanhante';

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Header
        variant="step"
        sticky
        bordered
        blurred
        onBack={() => navigate('/perfil')}
        meta={meta}
        // `Header` ainda é `.jsx` sem tipos próprios — `title`/`subtitle`/
        // `actions` não têm valor padrão na desestruturação, então o
        // TypeScript os infere como obrigatórios. Some quando `Header` migrar.
        title={undefined}
        subtitle={undefined}
        actions={undefined}
      />

      <main className="flex-1 p-6 pb-8">
        <div className="mb-6">
          <h1 className="text-[24px]/[1.25] font-semibold tracking-[-0.4px] text-foreground">
            {cuidadorAtual ? 'Gerenciar acompanhante' : 'Acompanhante'}
          </h1>
          {!cuidadorAtual && (
            <p className="mt-1 text-[14px]/[1.5] text-muted-foreground">
              Convide alguém de confiança para acompanhar sua jornada.
            </p>
          )}
        </div>

        {/* Estado novo, que o banco impõe: o convite existe antes do vínculo,
            e enquanto ele não for aceito não há acompanhante nenhum. */}
        {!cuidadorAtual && convitePendente && (
          <Card variant="default" padding="md" className="mb-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-supera-uniao)_15%,transparent)] text-[var(--color-supera-uniao)]">
                <Hourglass size={18} strokeWidth={2} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-foreground">Convite aguardando aceite</p>
                <p className="mt-1 flex items-center gap-1 text-[12px] text-muted-foreground">
                  <IconeCanal canal={convitePendente.canal} />
                  <span className="truncate text-foreground">{maskContact(convitePendente.canal, convitePendente.destino)}</span>
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Criado em {convitePendente.criadoLabel}
                </p>
              </div>
            </div>

            <p className="mt-3 text-[12px]/[1.5] text-muted-foreground">
              O vínculo só existe depois que a pessoa criar o login dela e informar o código que
              você entregou. <strong>O convite não expira sozinho</strong> — cancelar é a única
              forma de invalidar o código.
            </p>

            <Button
              variant="destructive-soft"
              size="sm"
              fullWidth
              className="mt-3"
              onClick={() => setConfirmandoCancelamento(true)}
            >
              Cancelar convite
            </Button>
          </Card>
        )}

        {!cuidadorAtual && !convitePendente && (
          <EmptyState
            icon={UserPlus}
            title="Nenhum acompanhante vinculado"
            description="Convide um familiar ou acompanhante para ajudar no seu cuidado — ele terá login próprio, sem acesso à sua senha."
            actionLabel="Convidar acompanhante"
            onAction={() => setModalAberto(true)}
          />
        )}

        {cuidadorAtual && (
          <>
            <Card variant="default" padding="md" className="mb-6 flex items-start gap-3">
              <Avatar
                name={maskContact(cuidadorAtual.canal, cuidadorAtual.contato) || 'Acompanhante'}
                size="lg"
                className="h-12 w-12 bg-[color-mix(in_srgb,var(--color-supera-empatia)_15%,transparent)] text-[var(--color-supera-empatia)]"
              />
              <div className="flex min-w-0 flex-col gap-0.5">
                {/* O nome da pessoa não é legível pelo titular: o vínculo é
                    identificado pelo contato para onde ELE mesmo mandou o
                    convite. */}
                <p className="truncate text-[16px] font-semibold text-foreground">
                  {cuidadorAtual.contato ? maskContact(cuidadorAtual.canal, cuidadorAtual.contato) : 'Acompanhante vinculado'}
                </p>
                <Badge tone="secondary" size="sm" className="mt-2">
                  <ShieldCheck size={12} strokeWidth={2} aria-hidden="true" />
                  Acompanhante
                </Badge>
                <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <IconeCanal canal={cuidadorAtual.canal} />
                  <span>
                    Login próprio · convidado por{' '}
                    {cuidadorAtual.canal === 'email' ? 'e-mail' : 'SMS'}
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Vinculado em {cuidadorAtual.vinculadoLabel}
                </p>
              </div>
            </Card>

            <Card variant="default" padding="md" className="mb-6">
              <h2 className="text-[14px] font-semibold text-foreground">Acesso do acompanhante</h2>

              <p className="mt-2 mb-2 text-[11px] font-medium tracking-[0.04em] uppercase text-[var(--color-mood-1)]">
                O acompanhante pode
              </p>
              <ul className="flex flex-col gap-2">
                {PERMISSOES_PODE.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[12px]/[1.4] text-foreground">
                    <Check
                      size={14}
                      strokeWidth={2.5}
                      className="mt-0.5 shrink-0 text-[var(--color-mood-1)]"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-4 mb-2 text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
                O acompanhante não pode
              </p>
              <ul className="flex flex-col gap-2">
                {PERMISSOES_NAO_PODE.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-[12px]/[1.4] text-muted-foreground"
                  >
                    <Lock
                      size={14}
                      strokeWidth={2}
                      className="mt-0.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--color-supera-uniao)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-supera-uniao)_5%,transparent)] p-3">
                <ShieldCheck
                  size={14}
                  strokeWidth={2.25}
                  className="mt-[1px] shrink-0 text-[var(--color-supera-uniao)]"
                  aria-hidden="true"
                />
                <p className="text-[11px]/[1.5] text-foreground">
                  O acompanhante entra com <strong>o login dele</strong> — nunca com a sua senha.
                  Remover o vínculo revoga o acesso na hora;{' '}
                  <strong>sua senha continua a mesma</strong>. As ações dele ficam na auditoria
                  identificadas como &ldquo;cuidador de você&rdquo;.
                </p>
              </div>
            </Card>

            <Button
              variant="destructive-soft"
              size="sm"
              fullWidth
              onClick={() => setConfirmandoRemocao(true)}
            >
              Remover acompanhante
            </Button>
            <p className="mt-2 mb-6 text-center text-[11px]/[1.5] text-muted-foreground">
              Remover revoga o acesso imediatamente — você não precisa trocar de senha. Para
              vincular outra pessoa, remova este vínculo primeiro: só pode haver um acompanhante
              por vez.
            </p>
          </>
        )}

        {historico.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 flex items-center gap-2 text-[12px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
              <History size={14} strokeWidth={2} aria-hidden="true" />
              Histórico de vínculos
            </h2>
            <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
              {historico.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    "relative before:absolute before:top-1 before:-left-[19px] before:h-2 before:w-2 before:rounded-full before:content-['']",
                    HISTORICO_DOT_CLASS[item.evento]
                  )}
                >
                  <p className="text-[14px] font-medium text-foreground">
                    {EVENTO_LABEL[item.evento]}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {item.contato ? `${item.contato} · ` : ''}
                    {item.dataLabel}
                  </p>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[11px]/[1.5] text-muted-foreground">
              Cada vínculo, revogação e ação do acompanhante fica registrado na auditoria (LGPD),
              identificado como &ldquo;cuidador de você&rdquo;.
            </p>
          </section>
        )}
      </main>

      <Modal
        open={confirmandoRemocao}
        onClose={() => setConfirmandoRemocao(false)}
        title="Remover acompanhante?"
        titleIcon={undefined}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setConfirmandoRemocao(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              loading={revokeMutation.isPending}
              onClick={handleRevogar}
            >
              Remover
            </Button>
          </>
        }
      >
        <p className="text-[14px]/[1.5] text-muted-foreground">
          Isso revoga o acesso imediatamente. Você não precisa trocar de senha, e o histórico do
          vínculo continua registrado.
        </p>
      </Modal>

      <Modal
        open={confirmandoCancelamento}
        onClose={() => setConfirmandoCancelamento(false)}
        title="Cancelar convite?"
        titleIcon={undefined}
        footer={
          <>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setConfirmandoCancelamento(false)}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              loading={cancelMutation.isPending}
              onClick={handleCancelarConvite}
            >
              Cancelar convite
            </Button>
          </>
        }
      >
        <p className="text-[14px]/[1.5] text-muted-foreground">
          O código que você entregou deixa de valer. Se a pessoa ainda não o usou, ela não vai
          conseguir concluir o vínculo — você pode criar um convite novo depois.
        </p>
      </Modal>

      <InviteCaregiverModal open={modalAberto} onClose={() => setModalAberto(false)} />
    </div>
  );
}
