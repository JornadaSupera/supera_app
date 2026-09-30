import { cva } from 'class-variance-authority';
import { Clock, Siren } from 'lucide-react';
import { chatCardClass } from './chatStyles';

/** O aviso de urgência do Chat — a mesma frase na lista e na conversa. */
const URGENCY_TEXT =
  'Em caso de urgência fora do horário, procure o pronto atendimento ou emergência mais próximo.';

const noticeVariants = cva(
  'mx-auto flex w-full max-w-[360px] flex-col gap-2.5 px-4 py-3 text-[13px] leading-[1.45]',
  {
    variants: {
      surface: {
        /** Na lista, sobre o fundo esverdeado: o cartão de sempre. */
        list: chatCardClass,
        /** Na conversa, sobre o cinza: branco com a sombra leve das bolhas. */
        conversation: 'rounded-[18px] bg-card shadow-[var(--shadow-bubble)]',
      },
    },
    defaultVariants: { surface: 'list' },
  }
);

interface ChatNoticeProps {
  /**
   * Horário da equipe (`seg–sex, 08h–18h`). Sem horário configurado — ou
   * enquanto carrega —, a linha não aparece: a tela não promete prazo de
   * resposta que ninguém definiu.
   */
  businessHours?: string | null;
  surface?: 'list' | 'conversation';
}

/**
 * Quando a equipe responde e o que fazer numa urgência. O Chat não é canal de
 * emergência, e isso fica à vista: no começo de toda conversa e no fim da
 * lista de conversas.
 */
export default function ChatNotice({ businessHours, surface }: ChatNoticeProps) {
  return (
    <div className={noticeVariants({ surface })}>
      {businessHours && (
        <div className="flex items-start gap-2.5 text-foreground">
          <Clock
            size={16}
            strokeWidth={2}
            className="mt-[2px] shrink-0 text-[var(--color-supera-seguranca)]"
            aria-hidden="true"
          />
          <span>
            A equipe responde no horário de atendimento: <strong className="font-semibold">{businessHours}</strong>.
          </span>
        </div>
      )}
      <div className="flex items-start gap-2.5 text-muted-foreground">
        <Siren size={16} strokeWidth={2} className="mt-[2px] shrink-0 text-destructive" aria-hidden="true" />
        <span>{URGENCY_TEXT}</span>
      </div>
    </div>
  );
}
