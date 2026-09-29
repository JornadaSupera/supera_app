import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, MessageCircle } from 'lucide-react';
import BrandMark from '../../components/ui/brand-mark';
import type { ChatSubjectInfo } from '../../types';

interface ConversationTitleProps {
  /** Quem atende: a área ("Enfermagem") ou "Equipe Supera". */
  teamName: string;
  /** O assunto da conversa, que também é o título dela. */
  subject: string;
  subjectInfo: ChatSubjectInfo | null;
  isOpen: boolean;
}

/**
 * Quem atende e o assunto, no topo da conversa: o selo da Supera (a equipe
 * responde como equipe, nunca pelo nome de uma pessoa) e, embaixo, o assunto
 * com o ícone dele.
 */
export function ConversationTitle({ teamName, subject, subjectInfo, isOpen }: ConversationTitleProps) {
  const SubjectGlyph = subjectInfo?.icon ?? MessageCircle;

  return (
    <>
      <BrandMark size="md" tone="inverse" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h1 className="truncate text-[17px] leading-[1.25] font-semibold">{teamName}</h1>
        <div className="flex min-w-0 items-center gap-1.5 text-[13px] leading-[1.3]">
          <SubjectGlyph size={14} strokeWidth={2.2} className="shrink-0" aria-hidden="true" />
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
 * (4,8:1). É a mesma no carregamento, no erro e no conteúdo — o "Voltar"
 * funciona desde o primeiro instante, mesmo com a conversa ainda carregando
 * ou sem abrir.
 *
 * `--color-ring` branco: o contorno de foco do reset global usa esta cor, e o
 * verde do foco sobre a barra verde não aparecia (a mesma solução da barra da
 * Central de Conhecimento).
 */
export default function ConversationTopBar({ children }: ConversationTopBarProps) {
  return (
    <header className="sticky top-0 z-20 bleed-x shrink-0 bg-[var(--color-brand-cover)] px-safe-4 pt-[calc(0.625rem_+_var(--safe-top))] pb-2.5 text-[var(--color-on-brand-cover)] shadow-sm [--color-ring:var(--color-on-brand-cover)]">
      <div className="flex items-center gap-2.5">
        <Link
          to="/chat"
          className="-ml-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 ease-[ease] hover:bg-[color-mix(in_srgb,var(--color-on-brand-cover)_14%,transparent)]"
          aria-label="Voltar"
        >
          <ChevronLeft size={24} strokeWidth={2.2} />
        </Link>
        {children}
      </div>
    </header>
  );
}
