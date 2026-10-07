import { FileClock } from 'lucide-react';
import Button from '../../components/ui/button';
import { LEGAL_DOCUMENT_ICONS, LEGAL_DOCUMENT_LABELS } from '../../utils/legal';
import { capitalizeFirst } from '../../utils/date';
import { cn } from '../../lib/utils';
import { profileRowClass } from './ProfileRows';
import type { ConsentRecordDetail } from '../../types';

interface ConsentRowProps {
  consent: ConsentRecordDetail;
  onRevoke: (id: string) => void;
}

/**
 * Um consentimento no card de lista do guia, como as linhas de Documentos logo
 * abaixo: o ícone do documento, o nome e, embaixo, versão e data. "Revogar" é
 * a cápsula discreta das ações de cartão, sem vermelho: no guia o vermelho é
 * só dos sinais de alarme, e o aviso de que é sério fica na confirmação.
 */
export default function ConsentRow({ consent, onRevoke }: ConsentRowProps) {
  const { documentKind: kind, documentVersion: version } = consent;
  // Sem tipo, a versão aceita já foi substituída e não se lê mais.
  const Icon = kind ? LEGAL_DOCUMENT_ICONS[kind] : FileClock;
  const title = kind ? LEGAL_DOCUMENT_LABELS[kind] : 'Versão anterior de um documento';
  const details = capitalizeFirst(
    [
      version !== null && `versão ${version}`,
      `aceito em ${consent.acceptedLabel}`,
      consent.revokedAt && 'revogado',
    ]
      .filter(Boolean)
      .join(' · ')
  );

  return (
    <li className={cn(profileRowClass, 'items-start')}>
      {/* Alinhado à linha do nome (24 px), não ao centro das duas linhas. */}
      <Icon size={24} strokeWidth={2} className="shrink-0 text-primary-deep" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body font-semibold text-foreground">{title}</span>
        <span className="text-caption font-medium text-muted-foreground">{details}</span>
      </div>
      {!consent.revokedAt && (
        <Button
          variant="soft"
          size="compact"
          pill
          className="shrink-0 self-center"
          aria-label={`Revogar ${title}`}
          onClick={() => onRevoke(consent.id)}
        >
          Revogar
        </Button>
      )}
    </li>
  );
}
