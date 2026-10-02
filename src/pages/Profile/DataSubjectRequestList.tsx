import { Download, FileClock } from 'lucide-react';
import Button from '../../components/ui/button';
import StatusChip from '../../components/ui/status-chip';
import InlineError from '../../components/ui/inline-error';
import Skeleton from '../../components/ui/skeleton';
import { formatDateBr } from '../../utils/date';
import { canDownloadExport, exportDeadline } from '../../utils/dataSubject';
import type { DataSubjectRequest, DataSubjectRequestStatus, DataSubjectRequestType } from '../../types';

const TYPE_LABEL: Record<DataSubjectRequestType, string> = {
  access: 'Acesso aos meus dados',
  portability: 'Cópia dos meus dados',
  rectification: 'Correção de dados',
  consent_revocation: 'Revogação de consentimento',
  deletion: 'Exclusão da conta',
};

/**
 * O andamento, em palavras do paciente.
 *
 * `executed` NÃO é "apagado": por decisão da clínica, a exclusão encerra o
 * acesso e o prontuário fica guardado (guia §5.19). Dizer "dados apagados"
 * seria prometer o que não aconteceu.
 */
const STATUS_LABEL: Record<DataSubjectRequestStatus, { tone: 'active' | 'waiting' | 'expired' | 'revoked'; label: string }> = {
  requested: { tone: 'waiting', label: 'Aguardando análise' },
  under_review: { tone: 'waiting', label: 'Em análise' },
  granted: { tone: 'active', label: 'Deferido' },
  executed: { tone: 'active', label: 'Concluído' },
  refused: { tone: 'expired', label: 'Recusado' },
};

/**
 * Como a observação do Centro (`decision_note`) aparece no pedido, ou `null`
 * quando ela não é mostrada.
 *
 * Na recusa é o motivo, sempre. Na correção é a resposta de quem corrigiu —
 * o painel a pede ao deferir e ao marcar como cumprida, e é por ela que a
 * pessoa sabe o que mudou na ficha.
 */
function decisionNoteLabel(request: DataSubjectRequest): string | null {
  if (!request.decisionNote) return null;
  if (request.status === 'refused') return 'Motivo: ';
  if (request.type === 'rectification') return 'Resposta do Centro: ';
  return null;
}

interface DataSubjectRequestListProps {
  requests: DataSubjectRequest[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onDownload: (requestId: string) => void;
  downloadingId: string | null;
}

/**
 * Os pedidos do titular: o que foi pedido, quando, em que pé está e — quando
 * for o caso — o motivo da recusa e o botão de baixar o pacote.
 *
 * O motivo da recusa aparece na íntegra de propósito: o art. 18 §4 da LGPD
 * existe para que ele chegue ao titular, e o banco passou a exigi-lo de quem
 * recusa (`refusal_requires_reason`).
 */
export default function DataSubjectRequestList({
  requests,
  isLoading,
  isError,
  onRetry,
  onDownload,
  downloadingId,
}: DataSubjectRequestListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando seus pedidos">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return <InlineError title="Não foi possível carregar seus pedidos" onRetry={onRetry} />;
  }

  if (requests.length === 0) {
    return (
      <p className="text-[12px]/[1.5] text-muted-foreground">
        Você ainda não fez nenhum pedido. Os pedidos que fizer aparecem aqui, com o andamento.
      </p>
    );
  }

  return (
    <ul role="list" className="flex flex-col gap-2">
      {requests.map((request) => {
        const status = STATUS_LABEL[request.status];
        const canDownload = canDownloadExport(request);
        const deadline = exportDeadline(request);
        const noteLabel = decisionNoteLabel(request);

        return (
          <li key={request.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-foreground">{TYPE_LABEL[request.type]}</p>
                <p className="text-[12px] text-muted-foreground">
                  Pedido em {formatDateBr(request.createdAt)}
                  {request.decidedAt && ` · analisado em ${formatDateBr(request.decidedAt)}`}
                </p>
              </div>
              <StatusChip tone={status.tone}>{status.label}</StatusChip>
            </div>

            {noteLabel && (
              <p className="rounded-lg bg-muted p-2.5 text-[12px]/[1.5] text-foreground">
                <span className="font-medium">{noteLabel}</span>
                {request.decisionNote}
              </p>
            )}

            {request.type === 'deletion' && request.status === 'executed' && (
              <p className="text-[12px]/[1.5] text-muted-foreground">
                Seu acesso ao aplicativo foi encerrado. Seu prontuário continua guardado pelo Centro,
                como manda a legislação de saúde.
              </p>
            )}

            {canDownload && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  // `hitArea`: o `sm` tem 32px de altura, abaixo dos 44px de
                  // alvo de toque mínimo do projeto.
                  hitArea
                  fullWidth
                  iconLeft={Download}
                  loading={downloadingId === request.id}
                  disabled={downloadingId !== null}
                  onClick={() => onDownload(request.id)}
                >
                  Baixar meus dados
                </Button>
                {deadline && (
                  <p className="flex items-start gap-1.5 text-[11px]/[1.5] text-muted-foreground">
                    <FileClock size={12} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
                    Você pode baixar até {formatDateBr(deadline)}. Depois disso é preciso fazer um novo
                    pedido.
                  </p>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
