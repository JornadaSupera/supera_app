import { cn } from '@/lib/utils';

/**
 * As frases de apoio da caderneta "Orientações ao Paciente", que o guia da
 * clínica pede para manter no app nos momentos emocionais (boas-vindas, tela
 * vazia, conclusão): escritas à mão, como no impresso, no estilo `affective`
 * do guia (Dancing Script, `text-affective`) e no verde dos títulos.
 */
export const CARE_PHRASES = {
  notAlone: 'Você não está sozinho!',
  seeBeauty: 'Quando tudo parecer sem cor… eu posso aprender a ver a beleza…',
  feelJoy: 'A sentir alegria, a superar as adversidades…',
} as const;

export interface AffectivePhraseProps {
  children: string;
  className?: string;
}

export default function AffectivePhrase({ children, className }: AffectivePhraseProps) {
  return (
    <p className={cn('text-center font-script text-affective font-semibold text-balance text-primary-deep', className)}>
      {children}
    </p>
  );
}
