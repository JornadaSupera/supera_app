import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Smartphone, Mail, Check, Lock, ShieldCheck, History } from 'lucide-react';
import Header from '../../components/ui/header';
import Avatar from '../../components/ui/avatar';
import Card from '../../components/ui/card';
import Badge from '../../components/ui/badge';
import Button from '../../components/ui/button';
import Modal from '../../components/ui/modal';
import EmptyState from '../../components/ui/empty-state';
import Loading from '../../components/ui/loading';
import { useToast } from '../../contexts/ToastContext';
import { getCuidador, removerCuidador } from '../../services/mockApi';
import { cn } from '../../lib/utils';
import InviteCaregiverModal from './InviteCaregiverModal';
import type { CaregiverHistoryEvent } from '../../types';

const EVENTO_LABEL: Record<CaregiverHistoryEvent, string> = {
  vinculo_ativo: 'Vínculo ativo',
  convite_aceito: 'Convite aceito',
  revogado: 'Vínculo revogado',
};

// Cor do marcador (::before) da linha do tempo de histórico, por tipo de
// evento — mesmo mapeamento de `.historico-${evento}` no CSS Module antigo.
const HISTORICO_DOT_CLASS: Record<CaregiverHistoryEvent, string> = {
  vinculo_ativo: 'before:bg-[var(--color-supera-empatia)]',
  convite_aceito: 'before:bg-[var(--color-mood-1)]',
  revogado: 'before:bg-muted-foreground',
};

const CAREGIVER_QUERY_KEY = ['caregiver'] as const;

export default function CaregiverManage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [modalAberto, setModalAberto] = useState(false);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);

  const {
    data: dadosCuidador,
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: CAREGIVER_QUERY_KEY, queryFn: getCuidador });

  const removeMutation = useMutation({
    mutationFn: removerCuidador,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CAREGIVER_QUERY_KEY });
      setConfirmandoRemocao(false);
      setModalAberto(false);
      showToast('Vínculo removido. O acesso foi revogado.', { variant: 'success' });
    },
  });

  function handleConviteEnviado() {
    // A invalidação de `['caregiver']` já acontece dentro da mutation de
    // `InviteCaregiverModal` — aqui só sobra fechar o modal e avisar.
    setModalAberto(false);
    showToast('Cuidador vinculado com sucesso!', { variant: 'success' });
  }

  if (isLoading) return <Loading />;

  if (isError || !dadosCuidador) {
    return (
      <EmptyState
        title="Não foi possível carregar os dados do cuidador"
        description="Verifique sua conexão e tente novamente."
        actionLabel="Tentar novamente"
        onAction={() => refetch()}
      />
    );
  }

  const cuidadorAtual = dadosCuidador.atual;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Header
        variant="step"
        sticky
        bordered
        blurred
        onBack={() => navigate('/perfil')}
        meta={cuidadorAtual ? 'Cuidador vinculado' : 'Cuidador'}
        // `Header` ainda é `.jsx` sem tipos próprios — como `title`/`subtitle`/
        // `actions` não têm valor padrão na desestruturação, o TypeScript os
        // infere como obrigatórios (mesmo sendo opcionais em tempo de
        // execução). Repassados como `undefined` só para satisfazer o tipo
        // inferido; some quando `Header` migrar para TS.
        title={undefined}
        subtitle={undefined}
        actions={undefined}
      />

      <main className="flex-1 p-6 pb-8">
        <div className="mb-6">
          {cuidadorAtual ? (
            <h1 className="text-[24px]/[1.25] font-semibold tracking-[-0.4px] text-foreground">
              Gerenciar cuidador
            </h1>
          ) : (
            <>
              <h1 className="text-[24px]/[1.25] font-semibold tracking-[-0.4px] text-foreground">
                Cuidador
              </h1>
              <p className="mt-1 text-[14px]/[1.5] text-muted-foreground">
                Convide alguém de confiança para acompanhar sua jornada.
              </p>
            </>
          )}
        </div>

        {!cuidadorAtual ? (
          <EmptyState
            icon={UserPlus}
            title="Nenhum cuidador vinculado"
            description="Convide um familiar ou acompanhante para ajudar no seu cuidado — ele terá login próprio, sem acesso à sua senha."
            actionLabel="Convidar cuidador"
            onAction={() => setModalAberto(true)}
          />
        ) : (
          <>
            <Card variant="default" padding="md" className="mb-6 flex items-start gap-3">
              <Avatar
                name={cuidadorAtual.nome}
                size="lg"
                // Fidelidade ao protótipo real: avatar do cuidador vinculado usa
                // 48px e o tom supera-empatia (não o cinza genérico padrão do
                // Avatar) — `size="lg"` só empresta o `text-[14px]` correto;
                // altura/largura e cores são sobrescritas aqui.
                className="h-12 w-12 bg-[color-mix(in_srgb,var(--color-supera-empatia)_15%,transparent)] text-[var(--color-supera-empatia)]"
              />
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-[16px] font-semibold text-foreground">{cuidadorAtual.nome}</p>
                <p className="text-[12px] text-muted-foreground">{cuidadorAtual.parentesco}</p>
                <Badge tone="secondary" size="sm" className="mt-2">
                  <ShieldCheck size={12} strokeWidth={2} aria-hidden="true" />
                  Acompanhante
                </Badge>
                <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                  {cuidadorAtual.meio === 'sms' ? (
                    <Smartphone size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                  ) : (
                    <Mail size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                  )}
                  <span>
                    Login próprio ·{' '}
                    <span className="text-foreground">{cuidadorAtual.contato}</span>{' '}
                    (confirmado por {cuidadorAtual.meio === 'sms' ? 'SMS' : 'e-mail'})
                  </span>
                </p>
              </div>
            </Card>

            <Card variant="default" padding="md" className="mb-6">
              <h2 className="text-[14px] font-semibold text-foreground">Acesso do acompanhante</h2>

              <p className="mt-2 mb-2 text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--color-mood-1)]">
                O acompanhante pode
              </p>
              <ul className="flex flex-col gap-2">
                {dadosCuidador.permissoesPode.map((item) => (
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

              <p className="mt-4 mb-2 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                O acompanhante não pode
              </p>
              <ul className="flex flex-col gap-2">
                {dadosCuidador.permissoesNaoPode.map((item) => (
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
                  O cuidador entra com <strong>o login dele</strong> (confirmado por{' '}
                  {cuidadorAtual.meio === 'sms' ? 'SMS' : 'e-mail'}) — nunca com a sua senha. Remover o
                  vínculo revoga o acesso na hora; <strong>sua senha continua a mesma</strong>. As ações
                  dele ficam na auditoria identificadas como &ldquo;cuidador de você&rdquo;.
                </p>
              </div>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setModalAberto(true)}>
                Trocar cuidador
              </Button>
              <Button
                variant="destructive-soft"
                size="sm"
                className="flex-1"
                onClick={() => setConfirmandoRemocao(true)}
              >
                Remover cuidador
              </Button>
            </div>
            <p className="mt-2 mb-6 text-center text-[11px] text-muted-foreground">
              Remover revoga o acesso imediatamente — você não precisa trocar de senha.
            </p>
          </>
        )}

        {dadosCuidador.historico.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
              <History size={14} strokeWidth={2} aria-hidden="true" />
              Histórico de vínculos
            </h2>
            <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
              {dadosCuidador.historico.map((item) => {
                const nomeExibido =
                  item.evento === 'revogado'
                    ? `${item.nome} (${item.parentesco.toLowerCase()})`
                    : item.nome;
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "relative before:absolute before:top-1 before:-left-[19px] before:h-2 before:w-2 before:rounded-full before:content-['']",
                      HISTORICO_DOT_CLASS[item.evento]
                    )}
                  >
                    <p className="text-[14px] font-medium text-foreground">{EVENTO_LABEL[item.evento]}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {nomeExibido} · {item.dataLabel}
                    </p>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 text-[11px]/[1.5] text-muted-foreground">
              Cada vínculo, revogação e ação do cuidador fica registrado na auditoria (LGPD),
              identificado como &ldquo;cuidador de você&rdquo;.
            </p>
          </section>
        )}
      </main>

      <Modal
        open={confirmandoRemocao}
        onClose={() => setConfirmandoRemocao(false)}
        title="Remover cuidador?"
        // `Modal` ainda é `.jsx` sem tipos próprios — `titleIcon` não tem valor
        // padrão na desestruturação, então o TypeScript o infere como
        // obrigatório (mesmo sendo opcional em tempo de execução). Repassado
        // como `undefined` só para satisfazer o tipo inferido; some quando
        // `Modal` migrar para TS.
        titleIcon={undefined}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setConfirmandoRemocao(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              loading={removeMutation.isPending}
              onClick={() => removeMutation.mutate()}
            >
              Remover
            </Button>
          </>
        }
      >
        <p className="text-[14px]/[1.5] text-muted-foreground">
          Isso revoga o acesso de {cuidadorAtual?.nome} imediatamente. Você não precisa trocar de
          senha.
        </p>
      </Modal>

      <InviteCaregiverModal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        onSucesso={handleConviteEnviado}
      />
    </div>
  );
}
