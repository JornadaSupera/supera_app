import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import BrandMark from '../../components/ui/brand-mark';
import SubjectIcon from './SubjectIcon';
import type { ChatSubjectInfo } from '../../types';

interface ConversationTopBarProps {
  /** O que vem depois do "Voltar": quem atende e o assunto — ou o skeleton deles. */
  children?: ReactNode;
}

/**
 * Barra do topo da conversa, em vidro fosco (`glass`): as mensagens passam
 * por baixo dela ao rolar. É a mesma no carregamento, no erro e no conteúdo —
 * o "Voltar" funciona desde o primeiro instante, mesmo com a conversa ainda
 * carregando ou sem abrir.
 */
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
 * responde como equipe, nunca pelo nome de uma pessoa) e o ícone do assunto.
 */
export function ConversationTitle({ teamName, subject, subjectInfo, isOpen }: ConversationTitleProps) {
  return (
    <>
      <BrandMark size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h1 className="truncate text-[16px] leading-[1.25] font-semibold text-foreground">{teamName}</h1>
        <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
          <span className="truncate">{subject}</span>
          {!isOpen && <span className="shrink-0">· Encerrada</span>}
        </div>
      </div>
      <SubjectIcon info={subjectInfo} size="sm" />
    </>
  );
}

export default function ConversationTopBar({ children }: ConversationTopBarProps) {
  return (
    <header className="glass sticky top-0 z-20 bleed-x shrink-0 border-b border-[var(--glass-edge)] px-safe-4 pt-[calc(0.75rem_+_var(--safe-top))] pb-3 shadow-[inset_0_1px_0_var(--glass-highlight)]">
      <div className="flex items-center gap-3">
        <Link
          to="/chat"
          className="-ml-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent text-foreground transition-colors duration-150 ease-[ease] hover:bg-muted"
          aria-label="Voltar"
        >
          <ChevronLeft size={22} strokeWidth={2} />
        </Link>
        {children}
      </div>
    </header>
  );
}
