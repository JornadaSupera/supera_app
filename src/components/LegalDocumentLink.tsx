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
 * O mesmo link no aceite do cadastro, no aceite do onboarding e nos termos
 * vigentes do Perfil → LGPD. O `data-document-link` é o que o cartão do
 * aceite usa para não marcar o aceite quando o toque cai no título.
 *
 * Camadas: a área de toque (`before`, 12px acima e abaixo) fica por baixo, e
 * o título, por cima de todas elas. Quando a frase quebra e um título fica
 * logo abaixo do outro, as áreas se cruzam. Sem as camadas, o toque no meio
 * de "Termos de Uso" caía na área da "Política de Privacidade", que vem
 * depois e ficava por cima. O título é `inline-block` para cobrir a linha
 * inteira, e por isso o sublinhado mora nele: um `inline-block` não herda o
 * sublinhado do botão.
 */
export default function LegalDocumentLink({ kind, onOpen }: LegalDocumentLinkProps) {
  return (
    <button
      type="button"
      data-document-link
      onClick={() => onOpen(kind)}
      className="group relative cursor-pointer rounded-sm border-none bg-transparent p-0 font-bold text-[var(--color-supera-seguranca)] before:absolute before:-inset-x-1 before:-inset-y-3 before:z-[1] before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
    >
      <span className="relative z-[2] inline-block underline decoration-2 decoration-[color-mix(in_srgb,var(--color-supera-seguranca)_35%,transparent)] underline-offset-4 transition-[text-decoration-color] duration-150 ease-[ease] group-hover:decoration-[var(--color-supera-seguranca)]">
        {LEGAL_DOCUMENT_LABELS[kind]}
      </span>
    </button>
  );
}
