import type { ReactNode } from 'react';
import { Download, FileClock } from 'lucide-react';
import Button from '../../components/ui/button';
import StatusChip from '../../components/ui/status-chip';
import InlineError from '../../components/ui/inline-error';
import Skeleton from '../../components/ui/skeleton';
import { formatDateBr } from '../../utils/date';
import { canDownloadExport, exportDeadline, isExportWindowClosed } from '../../utils/dataSubject';
import type {
  DataExportDownload,
  DataSubjectRequest,
  DataSubjectRequestStatus,
  DataSubjectRequestType,
} from '../../types';

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

/** A linha do prazo de download, com o relógio — antes e depois do prazo. */
function ExportDeadlineNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-caption font-medium text-muted-foreground">
      <FileClock size={16} strokeWidth={2} className="mt-px shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

interface DataSubjectRequestListProps {
  requests: DataSubjectRequest[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onDownload: (download: DataExportDownload) => void;
  /** O download em curso, se houver: o spinner cai só no botão tocado. */
  downloading: DataExportDownload | null;
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
  downloading,
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
      <p className="text-body-sm text-muted-foreground">
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
        const windowClosed = isExportWindowClosed(request);
        const noteLabel = decisionNoteLabel(request);

        return (
          // O card de lista do guia, com a sombra única dos cards da tela.
          <li key={request.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-body font-semibold text-foreground">{TYPE_LABEL[request.type]}</p>
                <p className="text-caption font-medium text-muted-foreground">
                  Pedido em {formatDateBr(request.createdAt)}
                  {request.decidedAt && ` · analisado em ${formatDateBr(request.decidedAt)}`}
                </p>
              </div>
              <StatusChip tone={status.tone}>{status.label}</StatusChip>
            </div>

            {/* A observação do Centro num bloco discreto dentro do cartão. O fio
                `line` por dentro desenha a caixa no tema escuro, onde o `muted`
                é a própria cor do cartão (como na `StatusChip` ao lado). */}
            {noteLabel && (
              <p className="rounded-lg bg-muted p-3 text-body-sm text-foreground ring-1 ring-border ring-inset">
                <span className="font-medium">{noteLabel}</span>
                {request.decisionNote}
              </p>
            )}

            {request.type === 'deletion' && request.status === 'executed' && (
              <p className="text-body-sm text-muted-foreground">
                Seu acesso ao aplicativo foi encerrado. Seu prontuário continua guardado pelo Centro,
                como manda a legislação de saúde.
              </p>
            )}

            {canDownload && (
              <>
                {/* Os dois que a Política de Privacidade promete: a cópia para
                    ler (PDF) e o formato estruturado para levar a outro
                    serviço (JSON, a portabilidade). O PDF é o principal. */}
                <Button
                  variant="outline"
                  fullWidth
                  iconLeft={Download}
                  loading={downloading?.requestId === request.id && downloading.format === 'pdf'}
                  disabled={downloading !== null}
                  onClick={() => onDownload({ requestId: request.id, format: 'pdf' })}
                >
                  Baixar meus dados (PDF)
                </Button>
                <Button
                  variant="ghost"
                  fullWidth
                  className="h-auto min-h-12 py-2.5 whitespace-normal text-center"
                  loading={downloading?.requestId === request.id && downloading.format === 'json'}
                  disabled={downloading !== null}
                  onClick={() => onDownload({ requestId: request.id, format: 'json' })}
                >
                  Baixar em JSON, para levar a outro serviço
                </Button>
                {deadline && (
                  <ExportDeadlineNote>
                    Você pode baixar até {formatDateBr(deadline)}. Depois disso é preciso fazer um novo
                    pedido.
                  </ExportDeadlineNote>
                )}
              </>
            )}

            {windowClosed && deadline && (
              <ExportDeadlineNote>
                O prazo para baixar terminou em {formatDateBr(deadline)}. Para receber seus dados, faça um novo
                pedido.
              </ExportDeadlineNote>
            )}
          </li>
        );
      })}
    </ul>
  );
}
