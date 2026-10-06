import { useId, type MouseEvent, type Ref } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import LegalDocumentLink from '../../components/LegalDocumentLink';
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
      {/* Marcado, o cartão fica como o chip selecionado do guia: fundo
          `surface-teal` e contorno no verde escuro. */}
      <div
        onClick={handleCardClick}
        className={cn(
          'flex cursor-pointer items-start gap-1 rounded-xl border py-2 pr-4 pl-2 transition-colors duration-150 ease-[ease]',
          checked ? 'border-primary-deep bg-secondary' : 'border-border bg-card',
          error && !checked && 'border-destructive'
        )}
      >
        {/* `-mt-[5.5px]`: a bolinha, no meio do botão de 48 px, fica no centro
            da primeira linha da frase — os 8 px do `py-2` da coluna de texto
            mais a metade da linha de 21 px do `text-body-sm`. Por isso o anel
            de foco fica por dentro do botão: por fora, ele passaria por cima
            do fio do cartão. O `!` do afastamento vence a regra global de
            `:focus-visible` do `index.css`, que fica fora de `@layer`. */}
        <button
          ref={ref}
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-labelledby={textId}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={Boolean(error)}
          onClick={() => onChange(!checked)}
          className="group -mt-[5.5px] flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent focus-visible:outline-2 focus-visible:outline-offset-[-2px]! focus-visible:outline-[var(--color-ring)]"
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border-2 transition-[background-color,border-color,transform] duration-150 ease-[ease] group-active:scale-90',
              checked
                ? 'border-primary bg-primary text-primary-foreground'
                : error
                  ? 'border-destructive bg-card'
                  : // Aro de 2 px no cinza do texto de apoio, como o quadrado da
                    // `Checkbox`: dá para achar a bolinha sem procurar (o
                    // `--color-input` sozinho some no fundo claro).
                    'border-muted-foreground bg-card group-hover:border-primary-deep'
            )}
          >
            {/* Traço 3 no ícone de 16 px: os 2 px do guia, como na `Checkbox`. */}
            <Check
              size={16}
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
          <p id={textId} className="text-body-sm text-foreground">
            Li e aceito os <LegalDocumentLink kind="terms_of_use" onOpen={onOpenDocument} /> e a{' '}
            <LegalDocumentLink kind="privacy_policy" onOpen={onOpenDocument} />.
          </p>
          <p id={hintId} className="text-caption font-medium text-muted-foreground">
            Toque nos títulos para ler o texto completo.
          </p>
        </div>
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-caption font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
