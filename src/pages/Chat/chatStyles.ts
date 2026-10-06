import { cva } from 'class-variance-authority';

// Classes compartilhadas pelas telas do Chat (lista, conversa e esqueletos).

/**
 * Fundo da lista do Chat: a cor-base do app (#F1F9F7, já com o toque do verde
 * da marca), para os cartões brancos se destacarem — o mesmo da Início e da
 * Central de Conhecimento.
 */
export const chatBackgroundClass = 'bg-background';

/**
 * Fundo da conversa: o vidro fosco com bambus das divisórias da clínica
 * (`@utility bamboo-glass`, em `index.css`). Fica parado enquanto as mensagens
 * rolam: a tela da conversa é o próprio contêiner que rola, e o fundo de quem
 * rola acompanha a caixa, não o conteúdo. Avisos, bolhas e a barra de digitar
 * continuam opacos por cima.
 */
export const conversationBackgroundClass = 'bamboo-glass';

/**
 * Cartão branco sobre esse fundo (lista de conversas, vazio, erro): o cartão
 * de lista do guia — 14 px de canto e a sombra leve (`shadow-card`). Os
 * cartões dos assuntos levam os 20 px dos cartões que sobem na capa, como os
 * temas da Central de Conhecimento, e o aviso do Chat (`ChatNotice`) é caixa
 * de aviso, com os 20 px dela.
 */
export const chatCardClass = 'rounded-lg border border-border bg-card shadow-sm';

/**
 * Cantos de uma bolha (texto ou imagem) no grupo de mensagens seguidas do
 * mesmo remetente: o canto que encosta na bolha vizinha fica pequeno, e a
 * bolha isolada ou a última do grupo ganha o "rabinho" do lado de quem
 * escreveu.
 */
export const bubbleCorners = cva('rounded-2xl', {
  variants: {
    side: { own: '', team: '' },
    position: { single: '', first: '', middle: '', last: '' },
  },
  compoundVariants: [
    { side: 'own', position: ['single', 'first'], className: 'rounded-br-[6px]' },
    { side: 'own', position: ['middle', 'last'], className: 'rounded-tr-[6px] rounded-br-[6px]' },
    { side: 'team', position: ['single', 'first'], className: 'rounded-bl-[6px]' },
    { side: 'team', position: ['middle', 'last'], className: 'rounded-tl-[6px] rounded-bl-[6px]' },
  ],
  defaultVariants: { side: 'own', position: 'single' },
});

/** Coluna do grupo: deste lado encosta à direita, a equipe à esquerda. */
export const groupAlignment = cva('flex flex-col gap-[3px]', {
  variants: {
    side: {
      own: 'ml-auto items-end',
      team: 'items-start',
    },
    width: {
      group: 'max-w-[82%]',
      item: '',
    },
  },
  defaultVariants: { side: 'own', width: 'item' },
});

/** A hora dentro da bolha de texto. */
export const bubbleTime = cva('mt-0.5 block text-right text-caption font-medium leading-none', {
  variants: {
    side: {
      own: '',
      team: 'text-muted-foreground',
    },
  },
  defaultVariants: { side: 'own' },
});

/**
 * Cor da bolha de texto: verde da capa deste lado, cartão do lado da equipe.
 * O texto é o corpo do guia (`text-body`, 16/24).
 */
export const bubbleSurface = cva(
  'px-4 pt-2 pb-1.5 text-body whitespace-pre-wrap break-words',
  {
    variants: {
      side: {
        // O verde da capa, e não o `primary`: com texto branco, o `primary`
        // dá 2,4:1 (abaixo dos 4,5:1 do texto); o da capa dá 4,7:1 no tema
        // claro e 5,7:1 no escuro.
        own: 'bg-[var(--color-brand-cover)] text-[var(--color-on-brand-cover)]',
        team: 'bg-card text-foreground shadow-[var(--shadow-bubble)]',
      },
    },
    defaultVariants: { side: 'own' },
  }
);
