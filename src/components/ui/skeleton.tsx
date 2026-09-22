import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Bloco cinza com a forma do conteúdo que ainda está chegando. É o estado de
 * carregamento que as listas usam — a regra do projeto pede "skeleton com a
 * forma da lista, não spinner solto", porque a tela já nasce com a altura
 * final e não pula quando o dado chega.
 *
 * Decorativo de propósito (`aria-hidden`): quem avisa o leitor de tela que
 * algo está carregando é o contêiner da lista, com `aria-busy`, e não cada
 * bloco — senão a pessoa ouviria "carregando" uma vez por linha.
 *
 * `motion-safe` respeita quem pediu menos animação no sistema: o bloco
 * aparece parado, sem pulsar.
 */
export default function Skeleton({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('motion-safe:animate-pulse rounded-md bg-muted', className)}
      {...rest}
    />
  );
}
