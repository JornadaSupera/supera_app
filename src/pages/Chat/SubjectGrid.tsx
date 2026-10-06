import { cn } from '../../lib/utils';
import { chatCardClass } from './chatStyles';
import SubjectIcon from './SubjectIcon';
import type { ChatSubjectOption } from '../../types';

interface SubjectGridProps {
  subjects: ChatSubjectOption[];
  /** Abre a nova conversa sobre o assunto tocado. */
  onSelect: (subject: ChatSubjectOption) => void;
}

/**
 * Os assuntos do chat em cartões brancos, dois por linha: tocar um abre a
 * nova conversa. O ícone vai sem pastilha — o cartão já é a moldura.
 */
export default function SubjectGrid({ subjects, onSelect }: SubjectGridProps) {
  return (
    <section aria-labelledby="chat-subjects-title" className="flex flex-col">
      <h2 id="chat-subjects-title" className="sr-only">
        Iniciar nova conversa
      </h2>
      <div className="grid grid-cols-1 gap-3 min-[300px]:grid-cols-2">
        {subjects.map((subject) => (
          <button
            type="button"
            key={subject.id}
            className={cn(
              chatCardClass,
              // Os 20 px de canto dos cartões que sobem na capa, como os temas
              // da Central de Conhecimento. O piso é a altura do cartão com a
              // descrição em duas linhas (1 + 16 + 24 + 12 + 20 + 2 + 2 × 18 +
              // 16 + 1 = 128): o de descrição curta e o esqueleto ficam do
              // mesmo tamanho. A descrição vai inteira — a mais longa estica a
              // linha da grade, e os dois cartões dela crescem juntos. O guia
              // tem uma sombra só: no hover, a borda ganha o verde.
              'flex min-h-[128px] cursor-pointer flex-col items-start gap-3 rounded-2xl p-4 text-left transition-[border-color,scale] duration-150 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] active:scale-[0.98] motion-reduce:active:scale-100'
            )}
            onClick={() => onSelect(subject)}
          >
            {/* `info` é `null` para um assunto cadastrado no banco que o app
                ainda não conhece: cai no ícone neutro em vez de sumir da
                tela, o que deixaria o paciente sem como falar dele. */}
            <SubjectIcon info={subject.info} size="plain" />
            <span className="flex flex-col gap-0.5">
              <span className="text-label font-semibold text-foreground">{subject.label}</span>
              {subject.info && (
                <span className="text-caption font-medium text-muted-foreground">
                  {subject.info.description}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
