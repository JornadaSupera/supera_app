import { TriangleAlert } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { getKnowledgeListIcon } from '../../utils/knowledgeCenter';
import type { KnowledgeBlock, KnowledgeImage, KnowledgeListItem } from '../../types';

type ListTone = 'default' | 'alert' | 'caution';

// Os blocos de lista do guia da clínica. `alert`: sinais de alerta, no bloco
// `alert-soft` com o triângulo ("AlertaUrgencia"). `caution`: cuidados em
// grade, com um triângulo verde em cada item ("ListaCuidados", do folheto do
// cateter). `default`: a lista solta, no texto da resposta.
//
// O bloco de alerta: os 24 px de respiro do guia só onde há espaço. Dentro da
// resposta aberta, num celular estreito, eles espremeriam a lista ao lado do
// triângulo a poucas palavras por linha.
const ALERT_PANEL_CLASS = 'flex gap-3 rounded-2xl bg-destructive-soft p-4 min-[400px]:p-6';

// O ponto fica no meio da primeira linha: (24 − 6) / 2 = 9 px na linha de
// 24 px do `text-body`, a da resposta e a dos sinais de alerta. Os cuidados
// não têm ponto: cada item leva o triângulo.
const bulletVariants = cva('mt-[9px] size-1.5 shrink-0 rounded-full', {
  variants: {
    tone: {
      default: 'bg-primary-deep',
      alert: 'bg-foreground',
    },
  },
});

const listVariants = cva('flex min-w-0 flex-1 flex-col', {
  variants: {
    tone: {
      // 8 px entre os itens, como na lista de alerta e nas caixas do guia.
      default: 'gap-2',
      // Duas colunas onde couberem (como no guia) e uma no celular: com duas
      // fixas, cada coluna teria uns 100 px dentro da resposta aberta.
      alert: 'block columns-[2_11rem] gap-x-8',
      // `min(220px, 100%)`: na tela de 280 px a resposta tem uns 200 px, e a
      // coluna mínima de 220 px do guia passaria da borda.
      caution: 'grid grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-x-6 gap-y-4',
    },
  },
});

const itemVariants = cva('flex', {
  variants: {
    tone: {
      default: 'gap-2.5',
      alert: 'mb-2 break-inside-avoid gap-2.5 text-body font-semibold text-foreground last:mb-0',
      caution: 'items-start gap-3 text-body font-medium text-foreground',
    },
  },
});

/** O marcador do item: o ícone do item, o triângulo dos cuidados, ou o ponto. */
function ItemMarker({ item, tone }: { item: KnowledgeListItem; tone: ListTone }) {
  // Ícone de traço, solto (sem pastilha), no verde escuro, como pede o guia.
  // Com 24 px, ele ocupa a primeira linha de 24 px do `text-body` sem ajuste.
  if (item.icon) {
    const Icon = getKnowledgeListIcon(item.icon);
    return <Icon size={24} strokeWidth={2} aria-hidden="true" className="shrink-0 text-primary-deep" />;
  }

  if (tone === 'caution') {
    return <TriangleAlert size={26} strokeWidth={2} className="shrink-0 text-primary-deep" aria-hidden="true" />;
  }

  return <span aria-hidden="true" className={bulletVariants({ tone })} />;
}

function AnswerList({ items, tone = 'default' }: { items: KnowledgeListItem[]; tone?: ListTone }) {
  // `role="list"`: o reset global tira o marcador da lista (`list-style: none`),
  // e sem ele o Safari/VoiceOver deixa de anunciá-la como lista. O `cn()` deixa
  // o `block`/`grid` do tom vencer o `flex` da base.
  const list = (
    <ul role="list" className={cn(listVariants({ tone }))}>
      {items.map((item) => (
        <li key={`${item.label ?? ''}|${item.text}`} className={itemVariants({ tone })}>
          <ItemMarker item={item} tone={tone} />
          <span className="min-w-0 flex-1">
            {item.label && <strong className="font-bold text-primary-deep">{item.label}: </strong>}
            {item.text}
          </span>
        </li>
      ))}
    </ul>
  );

  if (tone !== 'alert') return list;

  return (
    <div className={ALERT_PANEL_CLASS}>
      {/* O triângulo de 28 px do guia, centrado na primeira linha de 24 px da
          lista (`-mt-0.5`). */}
      <TriangleAlert size={28} strokeWidth={2} className="-mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
      {list}
    </div>
  );
}

function AnswerImage({ image }: { image: KnowledgeImage }) {
  return (
    <figure className="flex flex-col gap-2.5">
      {/* `width`/`height` reservam o espaço antes de a imagem chegar: o texto
          de baixo não pula. `lazy`: com a resposta fechada, nada é baixado. */}
      <img
        src={image.src}
        alt={image.alt}
        width={image.width}
        height={image.height}
        loading="lazy"
        decoding="async"
        className="h-auto w-full rounded-2xl bg-card shadow-sm"
      />
      {image.caption && (
        <figcaption className="px-1 text-caption font-medium text-muted-foreground">{image.caption}</figcaption>
      )}
    </figure>
  );
}

function AnswerBlock({ block }: { block: KnowledgeBlock }) {
  switch (block.type) {
    case 'paragraph':
      return <p className="text-pretty">{block.text}</p>;
    case 'list':
      return <AnswerList items={block.items} tone={block.tone} />;
    case 'image':
      return <AnswerImage image={block.image} />;
  }
}

/**
 * A resposta montada trecho a trecho: parágrafos, listas e imagens. Texto
 * sempre como texto (o React escapa), nunca como HTML.
 */
export default function KnowledgeAnswer({ blocks }: { blocks: KnowledgeBlock[] }) {
  return (
    <div className="flex flex-col gap-4 text-body text-foreground">
      {blocks.map((block, index) => (
        // A ordem dos trechos é fixa: o índice é uma chave estável aqui.
        <AnswerBlock key={index} block={block} />
      ))}
    </div>
  );
}
