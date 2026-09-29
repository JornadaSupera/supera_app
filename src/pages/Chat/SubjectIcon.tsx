import type { CSSProperties } from 'react';
import { cva } from 'class-variance-authority';
import { MessageCircle } from 'lucide-react';
import type { ChatSubjectInfo } from '../../types';

const subjectIconVariants = cva('flex shrink-0 items-center justify-center', {
  variants: {
    size: {
      sm: 'h-9 w-9 rounded-xl',
      md: 'h-11 w-11 rounded-2xl',
      // Só o traço, sem pastilha: o cartão já é a moldura.
      plain: '',
    },
    tinted: {
      true: 'text-[var(--subject-color)]',
      false: 'text-muted-foreground',
    },
  },
  compoundVariants: [
    { size: ['sm', 'md'], tinted: true, className: 'bg-[color-mix(in_srgb,var(--subject-color)_14%,transparent)]' },
    { size: ['sm', 'md'], tinted: false, className: 'bg-muted' },
  ],
  defaultVariants: { size: 'sm', tinted: false },
});

const ICON_SIZE = { sm: 17, md: 20, plain: 26 } as const;

interface SubjectIconProps {
  /** `null` para um assunto que o app ainda não conhece: cai no ícone neutro. */
  info: ChatSubjectInfo | null;
  /**
   * `sm`/`md` são a pastilha das linhas de lista e do cabeçalho; `plain` é só
   * o ícone, para os cartões dos assuntos (pastilha em grade de cartões pesa).
   */
  size?: keyof typeof ICON_SIZE;
}

/**
 * O ícone do assunto do chat (Medicação, Agendamento, Sintomas, Outros), na
 * cor do assunto. Um só para os cartões dos assuntos, a lista de conversas e
 * o cabeçalho da conversa.
 *
 * A cor vem numa custom property porque muda por assunto (`colorVar`): não há
 * classe estática que a expresse — mesmo mecanismo de `badge.tsx`/`tag.tsx`.
 */
export default function SubjectIcon({ info, size = 'sm' }: SubjectIconProps) {
  const Icon = info?.icon ?? MessageCircle;

  return (
    <span
      aria-hidden="true"
      className={subjectIconVariants({ size, tinted: Boolean(info) })}
      style={info ? ({ '--subject-color': info.colorVar } as CSSProperties) : undefined}
    >
      <Icon size={ICON_SIZE[size]} strokeWidth={size === 'plain' ? 1.8 : 2} />
    </span>
  );
}
