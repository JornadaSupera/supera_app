import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';

interface ConversationTopBarProps {
  /** O que vem depois do "Voltar": quem atende e o assunto — ou o skeleton deles. */
  children?: ReactNode;
}

/**
 * Barra do topo da conversa. É a mesma no carregamento, no erro e no
 * conteúdo: o "Voltar" funciona desde o primeiro instante, mesmo com a
 * conversa ainda carregando ou sem abrir.
 */
export default function ConversationTopBar({ children }: ConversationTopBarProps) {
  return (
    <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] p-4 pt-[calc(1rem_+_var(--safe-top))] backdrop-blur-[8px]">
      <div className="flex items-center gap-3">
        <Link
          to="/chat"
          className="-ml-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent text-foreground transition-colors duration-150 ease-[ease] hover:bg-muted"
          aria-label="Voltar"
        >
          <ChevronLeft size={20} strokeWidth={2} />
        </Link>
        {children}
      </div>
    </header>
  );
}
