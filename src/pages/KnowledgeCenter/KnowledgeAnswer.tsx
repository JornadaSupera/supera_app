import { TriangleAlert } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { getKnowledgeListIcon } from '../../utils/knowledgeCenter';
import type { KnowledgeBlock, KnowledgeImage, KnowledgeListItem } from '../../types';

type ListTone = 'default' | 'alert' | 'caution';

// `alert`: sinais de alerta, em vermelho, numa caixa com o triângulo (como a
// caixa do manual impresso). `caution`: cuidados, com um triângulo verde em
// cada item (como os do folheto do cateter).
const listPanelVariants = cva('', {
  variants: {
    tone: {
      default: '',
      alert:
        'flex gap-3 rounded-[16px] border border-[color-mix(in_srgb,var(--color-destructive)_24%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_6%,transparent)] p-4',
      caution:
        'rounded-[16px] border border-[color-mix(in_srgb,var(--color-supera-seguranca)_24%,transparent)] bg-[color-mix(in_srgb,var(--color-supera-seguranca)_6%,transparent)] p-4',
    },
  },
});

const bulletVariants = cva('mt-[0.66em] size-1.5 shrink-0 rounded-full', {
  variants: {
    tone: {
      default: 'bg-primary',
      alert: 'bg-destructive',
      caution: 'bg-[var(--color-supera-seguranca)]',
    },
  },
});

const listVariants = cva('flex min-w-0 flex-1 flex-col', {
  variants: {
    tone: {
      default: 'gap-2.5',
      alert: 'gap-2.5',
      caution: 'gap-3',
    },
  },
});

/** O marcador do item: o ícone do item, o triângulo dos cuidados, ou o ponto. */
function ItemMarker({ item, tone }: { item: KnowledgeListItem; tone: ListTone }) {
  if (item.icon) {
    const Icon = getKnowledgeListIcon(item.icon);
    return (
      <span
        aria-hidden="true"
        className="mt-[1px] inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] text-primary"
      >
        <Icon size={15} strokeWidth={2} />
      </span>
    );
  }

  if (tone === 'caution') {
    return (
      <TriangleAlert
        size={17}
        strokeWidth={2}
        className="mt-[3px] shrink-0 text-[var(--color-supera-seguranca)]"
        aria-hidden="true"
      />
    );
  }

  // O ponto fica no meio da primeira linha (0,66em com a altura de linha 1,7).
  return <span aria-hidden="true" className={bulletVariants({ tone })} />;
}

function AnswerList({ items, tone = 'default' }: { items: KnowledgeListItem[]; tone?: ListTone }) {
  // `role="list"`: o reset global tira o marcador da lista (`list-style: none`),
  // e sem ele o Safari/VoiceOver deixa de anunciá-la como lista.
  const list = (
    <ul role="list" className={listVariants({ tone })}>
      {items.map((item) => (
        <li key={`${item.label ?? ''}|${item.text}`} className="flex gap-2.5">
          <ItemMarker item={item} tone={tone} />
          <span className="min-w-0 flex-1">
            {item.label && <strong className="font-semibold">{item.label}: </strong>}
            {item.text}
          </span>
        </li>
      ))}
    </ul>
  );

  if (tone === 'default') return list;

  return (
    <div className={listPanelVariants({ tone })}>
      {tone === 'alert' && (
        <TriangleAlert size={18} strokeWidth={2} className="mt-[3px] shrink-0 text-destructive" aria-hidden="true" />
      )}
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
        className="h-auto w-full rounded-[18px] bg-card shadow-[var(--shadow-raised)]"
      />
      {image.caption && (
        <figcaption className="px-1 text-[12.5px]/[1.5] text-muted-foreground">{image.caption}</figcaption>
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
    <div className="flex flex-col gap-4 text-[16px]/[1.7] text-foreground">
      {blocks.map((block, index) => (
        // A ordem dos trechos é fixa: o índice é uma chave estável aqui.
        <AnswerBlock key={index} block={block} />
      ))}
    </div>
  );
}
