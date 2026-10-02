import { LEGAL_DOCUMENT_LABELS } from '../utils/legal';
import type { LegalDocumentKind } from '../types';

export interface LegalDocumentLinkProps {
  kind: LegalDocumentKind;
  onOpen: (kind: LegalDocumentKind) => void;
}

/**
 * O título do documento, em negrito e na cor de destaque (`--color-supera-seguranca`,
 * distinta do texto e legível nos dois temas), que abre o texto completo. Tem
 * o traço embaixo para não depender só da cor para parecer link, e uma área de
 * toque maior que a linha de texto.
 *
 * O mesmo link no aceite do cadastro e nos termos vigentes do Perfil → LGPD.
 * O `data-document-link` é o que o cartão do aceite usa para não marcar o
 * aceite quando o toque cai no título.
 */
export default function LegalDocumentLink({ kind, onOpen }: LegalDocumentLinkProps) {
  return (
    <button
      type="button"
      data-document-link
      onClick={() => onOpen(kind)}
      className="relative cursor-pointer rounded-sm border-none bg-transparent p-0 font-bold text-[var(--color-supera-seguranca)] underline decoration-2 decoration-[color-mix(in_srgb,var(--color-supera-seguranca)_35%,transparent)] underline-offset-4 transition-[text-decoration-color] duration-150 ease-[ease] before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[''] hover:decoration-[var(--color-supera-seguranca)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
    >
      {LEGAL_DOCUMENT_LABELS[kind]}
    </button>
  );
}
