import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOpenLegalDocument } from '../../hooks/useLegal';
import { LEGAL_DOCUMENT_ICONS, LEGAL_DOCUMENT_LABELS } from '../../utils/legal';
import type { LegalDocumentKind } from '../../types';
import { profileLinkRowClass } from './ProfileRows';

const DOCUMENT_KINDS: LegalDocumentKind[] = ['terms_of_use', 'privacy_policy'];

/**
 * Os dois documentos legais como linhas do Perfil: tocar abre o texto completo
 * na janela do app, sem sair dele. É o mesmo texto que a pessoa leu ao aceitar
 * no cadastro (página pública do painel), então serve mesmo quando o banco
 * ainda não tem versão publicada.
 *
 * Devolve só as linhas, sem o contêiner: quem usa põe dentro da sua lista, com
 * o espaçamento dela.
 */
export default function LegalDocumentLinks() {
  const openDocument = useOpenLegalDocument();

  function handleOpen(kind: LegalDocumentKind) {
    // Segurar o segundo toque: a janela do app leva um instante para abrir e
    // empilharia duas por cima uma da outra.
    if (openDocument.isPending) return;
    openDocument.mutate(kind);
  }

  return (
    <>
      {DOCUMENT_KINDS.map((kind) => {
        const Icon = LEGAL_DOCUMENT_ICONS[kind];
        return (
          <button
            key={kind}
            type="button"
            aria-busy={openDocument.isPending && openDocument.variables === kind}
            onClick={() => handleOpen(kind)}
            // A mesma linha de `ProfileLinkRow`, que divide a lista com esta.
            className={cn(
              profileLinkRowClass,
              'w-full cursor-pointer text-left',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]'
            )}
          >
            <Icon size={24} strokeWidth={2} className="shrink-0 text-primary-deep" aria-hidden="true" />
            <span className="flex-1 text-body font-normal text-foreground">
              {LEGAL_DOCUMENT_LABELS[kind]}
              <span className="sr-only">, abre em uma janela dentro do app</span>
            </span>
            <ExternalLink
              size={20}
              strokeWidth={2}
              className="shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        );
      })}
    </>
  );
}
