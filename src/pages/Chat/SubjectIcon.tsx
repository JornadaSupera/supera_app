import { cva } from 'class-variance-authority';
import { MessageCircle } from 'lucide-react';
import type { ChatSubjectInfo } from '../../types';

// Só o traço, sem pastilha, como manda o guia ("traço 2px, em teal-deep ou
// ink-muted"): duas das cores próprias (Sintomas e Outros) não chegavam a 3:1
// sobre o branco. A caixa de `sm`/`md` só alinha o ícone; não desenha nada.
const subjectIconVariants = cva('flex shrink-0 items-center justify-center', {
  variants: {
    size: {
      sm: 'h-9 w-9',
      md: 'h-11 w-11',
      plain: '',
    },
    tinted: {
      true: 'text-primary-deep',
      false: 'text-muted-foreground',
    },
  },
  defaultVariants: { size: 'sm', tinted: false },
});

// No cartão do assunto e na linha da conversa, o mesmo ícone solto de 24 px do
// guia (e dos cartões dos temas da Central de Conhecimento).
const ICON_SIZE = { sm: 20, md: 24, plain: 24 } as const;

interface SubjectIconProps {
  /** `null` para um assunto que o app ainda não conhece: cai no ícone neutro. */
  info: ChatSubjectInfo | null;
  /**
   * `plain` é só o ícone, sem caixa: o dos cartões dos assuntos e das linhas
   * da lista de conversas, na margem do cartão. `sm`/`md` ocupam uma caixa
   * fixa (36 e 44 px) e hoje ficam sem uso.
   */
  size?: keyof typeof ICON_SIZE;
}

/**
 * O ícone do assunto do chat (Medicação, Agendamento, Sintomas, Outros), no
 * verde escuro da marca (`primary-deep`); o assunto desconhecido fica no cinza
 * do texto de apoio. Um só para os cartões dos assuntos e a lista de conversas.
 */
export default function SubjectIcon({ info, size = 'sm' }: SubjectIconProps) {
  const Icon = info?.icon ?? MessageCircle;

  return (
    <span aria-hidden="true" className={subjectIconVariants({ size, tinted: Boolean(info) })}>
      <Icon size={ICON_SIZE[size]} strokeWidth={2} />
    </span>
  );
}
