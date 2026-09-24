import { useId, type MouseEvent, type Ref } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LEGAL_DOCUMENT_LABELS } from '../../utils/legal';
import type { LegalDocumentKind } from '../../types';

interface TermsConsentProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Abre o texto completo do documento, dentro do app. */
  onOpenDocument: (kind: LegalDocumentKind) => void;
  error?: string;
  /** Vai ao marcador: é ele que recebe o foco quando o aceite falta no envio. */
  ref?: Ref<HTMLButtonElement>;
}

interface DocumentLinkProps {
  kind: LegalDocumentKind;
  onOpen: (kind: LegalDocumentKind) => void;
}

/**
 * O título do documento, em negrito e na cor de destaque (`--color-supera-seguranca`,
 * distinta do texto e legível nos dois temas), que abre o texto completo. Tem
 * o traço embaixo para não depender só da cor para parecer link, e uma área de
 * toque maior que a linha de texto.
 */
function DocumentLink({ kind, onOpen }: DocumentLinkProps) {
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

/**
 * Aceite dos Termos de Uso e da Política de Privacidade, dentro do cadastro.
 *
 * O marcador é uma bolinha que enche ao marcar; a frase leva os dois títulos
 * em negrito e cor de destaque, e tocar num deles abre o documento para ler.
 * O cartão inteiro alterna o aceite (menos os títulos), então o alvo de toque
 * é grande, mas quem usa leitor de tela ou teclado encontra um único controle:
 * o marcador, com a frase como nome.
 */
export default function TermsConsent({ checked, onChange, onOpenDocument, error, ref }: TermsConsentProps) {
  const textId = useId();
  const hintId = useId();
  const errorId = useId();

  function handleCardClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    // Os títulos abrem o documento e o marcador cuida de si.
    if (target.closest('[data-document-link], [role="checkbox"]')) return;
    onChange(!checked);
  }

  return (
    <div className="flex flex-col gap-2">
      {/* O clique no cartão é conveniência de quem toca; o controle de teclado
          e de leitor de tela é o marcador. */}
      <div
        onClick={handleCardClick}
        className={cn(
          'flex cursor-pointer items-start gap-1 rounded-xl border py-2 pr-4 pl-2 transition-colors duration-150 ease-[ease]',
          checked
            ? 'border-[color-mix(in_srgb,var(--color-supera-seguranca)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-supera-seguranca)_7%,var(--color-card))]'
            : 'border-border bg-card',
          error && !checked && 'border-destructive'
        )}
      >
        <button
          ref={ref}
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-labelledby={textId}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={Boolean(error)}
          onClick={() => onChange(!checked)}
          className="group flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-ring)]"
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border-2 transition-[background-color,border-color,transform] duration-150 ease-[ease] group-active:scale-90',
              checked
                ? 'border-[var(--color-supera-seguranca)] bg-[var(--color-supera-seguranca)] text-primary-foreground'
                : error
                  ? 'border-destructive bg-card'
                  : // Aro visível o bastante para achar a bolinha sem procurar (o
                    // `--color-input` sozinho some no fundo claro).
                    'border-[color-mix(in_srgb,var(--color-muted-foreground)_70%,transparent)] bg-card group-hover:border-[var(--color-supera-seguranca)]'
            )}
          >
            <Check
              size={14}
              strokeWidth={3}
              className={cn(
                'transition-opacity duration-150 ease-[ease]',
                checked ? 'opacity-100' : 'opacity-0'
              )}
            />
          </span>
        </button>

        {/* O espaço entre os textos é `gap`: o reset de `index.css` zera a
            margem de `<p>` e vence `mt-*`. */}
        <div className="flex min-w-0 flex-1 flex-col gap-1 py-2">
          <p id={textId} className="text-[14px]/[1.5] text-foreground">
            Li e aceito os <DocumentLink kind="terms_of_use" onOpen={onOpenDocument} /> e a{' '}
            <DocumentLink kind="privacy_policy" onOpen={onOpenDocument} />.
          </p>
          <p id={hintId} className="text-[12px]/[1.4] text-muted-foreground">
            Toque nos títulos para ler o texto completo.
          </p>
        </div>
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-[12px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
