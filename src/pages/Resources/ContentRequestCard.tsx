import { useNavigate } from 'react-router';
import { BookOpen, Undo2 } from 'lucide-react';
import Button from '../../components/ui/button';
import StatusChip, { type StatusChipProps } from '../../components/ui/status-chip';
import { formatDateBr } from '../../utils/date';
import type { ContentRequest, ContentRequestStatus } from '../../types';

/** A situação do pedido em texto (a cor sozinha não diz nada). */
const STATUS_PRESENTATION: Record<ContentRequestStatus, { label: string; tone: StatusChipProps['tone'] }> = {
  open: { label: 'Aguardando a equipe', tone: 'waiting' },
  fulfilled: { label: 'Respondido', tone: 'active' },
  declined: { label: 'Não atendido', tone: 'revoked' },
  cancelled: { label: 'Retirado', tone: 'revoked' },
};

interface ContentRequestCardProps {
  request: ContentRequest;
  /** A conta da sessão fez este pedido: só ela pode retirá-lo. */
  isMine: boolean;
  onCancel: () => void;
}

/**
 * Um pedido de orientação. O pedido não se edita (é registro); aberto, quem
 * pediu pode retirá-lo.
 */
export default function ContentRequestCard({ request, isMine, onCancel }: ContentRequestCardProps) {
  const navigate = useNavigate();
  const status = STATUS_PRESENTATION[request.status];

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusChip tone={status.tone}>{status.label}</StatusChip>
        <span className="text-caption font-medium text-muted-foreground">
          Pedido em {formatDateBr(request.createdAt)}
        </span>
      </div>

      <p className="text-body break-words whitespace-pre-line text-foreground">{request.context}</p>

      {/* O titular vê também os pedidos do acompanhante, mas não os retira. */}
      {!isMine && (
        <p className="text-caption font-medium text-muted-foreground">Pedido feito pelo seu acompanhante</p>
      )}

      {request.status === 'declined' && request.declineReason && (
        <div className="flex flex-col gap-0.5 rounded-sm bg-muted p-3">
          <span className="text-label font-semibold text-foreground">Resposta da equipe</span>
          <p className="text-body-sm break-words text-foreground">{request.declineReason}</p>
        </div>
      )}

      {request.status === 'fulfilled' && request.fulfilledResourceId && (
        <Button
          variant="soft"
          size="compact"
          pill
          iconLeft={BookOpen}
          className="self-start"
          onClick={() => navigate(`/orientacoes/${request.fulfilledResourceId}`)}
        >
          Ver orientação
        </Button>
      )}

      {/* Ação do cartão: a cápsula discreta, à direita (pedido de 23/10). */}
      {request.status === 'open' && isMine && (
        <Button variant="soft" size="compact" pill iconLeft={Undo2} className="self-end" onClick={onCancel}>
          Retirar pedido
        </Button>
      )}
    </article>
  );
}
