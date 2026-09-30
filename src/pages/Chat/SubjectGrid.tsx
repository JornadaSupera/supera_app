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
              'flex min-h-[124px] cursor-pointer flex-col items-start gap-3 p-4 text-left transition-[box-shadow,scale] duration-150 ease-[ease] hover:shadow-[var(--shadow-raised-strong)] active:scale-[0.98] motion-reduce:active:scale-100'
            )}
            onClick={() => onSelect(subject)}
          >
            {/* `info` é `null` para um assunto cadastrado no banco que o app
                ainda não conhece: cai no ícone neutro em vez de sumir da
                tela, o que deixaria o paciente sem como falar dele. */}
            <SubjectIcon info={subject.info} size="plain" />
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] leading-[1.3] font-semibold text-foreground">{subject.label}</span>
              {subject.info && (
                <span className="line-clamp-2 text-[12px] leading-[1.4] text-muted-foreground">
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
