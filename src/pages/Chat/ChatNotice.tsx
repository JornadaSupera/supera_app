import { cva } from 'class-variance-authority';
import { Clock, TriangleAlert } from 'lucide-react';

/** O aviso de urgência do Chat — a mesma frase na lista e na conversa. */
const URGENCY_TEXT =
  'Em caso de urgência fora do horário, procure o pronto atendimento ou emergência mais próximo.';

// A caixa de aviso do guia: 20 px de canto e 16 px de respiro, com o fio e a
// sombra dos cartões — no tema escuro, é o fio que a desenha sobre o fundo. O
// texto é o `text-body-sm` (14/21). Escrito por extenso, e não com o
// `chatCardClass`: a saída do `cva` não passa pelo `cn()`, e um segundo canto
// não substituiria o de 14 px do cartão de lista.
const noticeVariants = cva(
  'flex w-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-body-sm shadow-sm',
  {
    variants: {
      surface: {
        /**
         * Na lista, sobre o fundo esverdeado: a largura da coluna, alinhada
         * com os assuntos e as conversas.
         */
        list: '',
        /** Na conversa, sobre os bambus: opaco e centrado entre as mensagens. */
        conversation: 'mx-auto max-w-[360px]',
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
        <div className="flex items-start gap-3 text-foreground">
          {/* `-my-[1.5px]`: o ícone de 24 px centrado na primeira linha, de 21 px, como no `Toast`. */}
          <Clock size={24} strokeWidth={2} className="-my-[1.5px] shrink-0 text-primary-deep" aria-hidden="true" />
          <span>
            A equipe responde no horário de atendimento: <strong className="font-semibold">{businessHours}</strong>.
          </span>
        </div>
      )}
      {/* Como o alerta do guia ("AlertaUrgencia"): o triângulo no vermelho de
          alerta e o texto na tinta escura, como no modelo do Chat da clínica. */}
      <div className="flex items-start gap-3 text-foreground">
        <TriangleAlert size={24} strokeWidth={2} className="-my-[1.5px] shrink-0 text-destructive" aria-hidden="true" />
        <span>{URGENCY_TEXT}</span>
      </div>
    </div>
  );
}
