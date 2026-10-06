import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import BrandMark from '../../components/ui/brand-mark';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import type { ChatSubjectInfo } from '../../types';

interface ConversationTitleProps {
  /** Quem atende: a área ("Enfermagem") ou "Equipe Supera". */
  teamName: string;
  /** O assunto da conversa, que também é o título dela. */
  subject: string;
  /**
   * @deprecated Ignorado: o assunto vai só em texto, como no modelo do Chat da
   * clínica. Sai daqui quando o `dev/ChatShowcase.tsx` deixar de passá-lo.
   */
  subjectInfo?: ChatSubjectInfo | null;
  isOpen: boolean;
}

/**
 * Quem atende e o assunto, no topo da conversa: o selo da Supera (a equipe
 * responde como equipe, nunca pelo nome de uma pessoa) e, embaixo, o assunto
 * em texto, sem ícone (modelo do Chat da clínica).
 */
export function ConversationTitle({ teamName, subject, isOpen }: ConversationTitleProps) {
  return (
    <>
      <BrandMark size="md" tone="inverse" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h1 className="truncate text-section font-bold">{teamName}</h1>
        <div className="flex min-w-0 items-center gap-1.5 text-label">
          <span className="truncate">{subject}</span>
          {!isOpen && <span className="shrink-0">· Encerrada</span>}
        </div>
      </div>
    </>
  );
}

interface ConversationTopBarProps {
  /** O que vem depois do "Voltar": quem atende e o assunto — ou o skeleton deles. */
  children?: ReactNode;
}

/**
 * Barra do topo da conversa, no verde da capa da marca, com o texto em branco
 * (4,7:1 no tema claro, 5,7:1 no escuro), e plana: encosta nos bambus sem
 * sombra, como no modelo do Chat da clínica. É a mesma no carregamento, no
 * erro e no conteúdo — o "Voltar" funciona desde o primeiro instante, mesmo
 * com a conversa ainda carregando ou sem abrir.
 *
 * `--color-ring` branco: o contorno de foco do reset global usa esta cor, e o
 * laranja do foco fica em 2,1:1 sobre o verde da barra no tema claro, abaixo
 * dos 3:1 (decisão: branco nas capas verdes).
 */
export default function ConversationTopBar({ children }: ConversationTopBarProps) {
  // Volta para onde a pessoa estava (a lista do Chat, as Notificações, a
  // Home); só cai na lista quando a conversa foi aberta direto. O link
  // continua com o endereço da lista — é o mesmo elemento de antes, só o
  // toque que volta no histórico.
  const goBack = useGoBackOr('/chat');

  return (
    <header className="sticky top-0 z-20 bleed-x shrink-0 bg-[var(--color-brand-cover)] px-safe-4 pt-[calc(0.625rem_+_var(--safe-top))] pb-2.5 text-[var(--color-on-brand-cover)] [--color-ring:var(--color-on-brand-cover)]">
      <div className="flex items-center gap-2.5">
        {/* `-ml-3`: a seta de 24 px fica na margem de 16 px da tela, no mesmo
            lugar do voltar das outras barras (`TabHeader`, `StepHeader`). */}
        <Link
          to="/chat"
          onClick={(event) => {
            event.preventDefault();
            goBack();
          }}
          className="-ml-3 flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 ease-[ease] hover:bg-[color-mix(in_srgb,var(--color-on-brand-cover)_14%,transparent)]"
          aria-label="Voltar"
        >
          <ChevronLeft size={24} strokeWidth={2} />
        </Link>
        {children}
      </div>
    </header>
  );
}
