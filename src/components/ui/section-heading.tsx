import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SectionHeadingProps {
  id?: string;
  children: ReactNode;
  /** O que vai à direita do título (ex.: "Ver todas"). */
  action?: ReactNode;
  className?: string;
}

/**
 * Título de seção das telas com a capa da marca: um traço verde e o título em
 * frase normal (sem caixa alta). É um `<h2>`.
 */
export default function SectionHeading({ id, children, action, className }: SectionHeadingProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3 px-1', className)}>
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="h-4 w-1 rounded-full bg-primary" />
        <h2 id={id} className="text-[17px]/[1.3] font-semibold tracking-[-0.2px] text-foreground">
          {children}
        </h2>
      </div>
      {action}
    </div>
  );
}
