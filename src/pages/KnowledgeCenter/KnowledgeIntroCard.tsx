import { HeartHandshake } from 'lucide-react';
import ExpansionTile from '../../components/ui/expansion-tile';
import AffectivePhrase from '../../components/ui/affective-phrase';
import type { KnowledgeIntro } from '../../types';

/**
 * A abertura do manual impresso, antes dos temas: o acolhimento de quem acabou
 * de receber o diagnóstico. Recolhida, no mesmo cartão das perguntas, para os
 * temas continuarem à vista. Texto da clínica, palavra por palavra; o fecho vai
 * na letra das frases de apoio, como o "Você não está sozinho!" da Início.
 */
export default function KnowledgeIntroCard({ intro }: { intro: KnowledgeIntro }) {
  return (
    <ExpansionTile variant="raised" icon={HeartHandshake} title="Antes de começar">
      <div className="flex flex-col gap-4 text-body text-foreground">
        {/* Em destaque, como no impresso. */}
        <p className="font-semibold text-pretty text-primary-deep">{intro.lead}</p>
        {intro.paragraphs.map((paragraph) => (
          <p key={paragraph} className="text-pretty">
            {paragraph}
          </p>
        ))}
        <div className="flex flex-col gap-1 pt-1">
          <p className="text-center text-body-sm text-muted-foreground">{intro.closing.prompt}</p>
          <AffectivePhrase>{intro.closing.phrase}</AffectivePhrase>
        </div>
      </div>
    </ExpansionTile>
  );
}
