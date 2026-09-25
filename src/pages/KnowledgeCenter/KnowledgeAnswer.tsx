import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KnowledgeBlock, KnowledgeImage, KnowledgeListItem } from '../../types';

function AnswerList({ items, tone }: { items: KnowledgeListItem[]; tone?: 'alert' }) {
  const isAlert = tone === 'alert';

  // `role="list"`: o reset global tira o marcador da lista (`list-style: none`),
  // e sem ele o Safari/VoiceOver deixa de anunciá-la como lista.
  const list = (
    <ul role="list" className="flex min-w-0 flex-1 flex-col gap-2">
      {items.map((item) => (
        <li key={`${item.label ?? ''}|${item.text}`} className="flex gap-2.5">
          {/* O ponto fica no meio da primeira linha (0,62em com a altura de linha 1,65). */}
          <span
            aria-hidden="true"
            className={cn('mt-[0.62em] size-1.5 shrink-0 rounded-full', isAlert ? 'bg-destructive' : 'bg-primary')}
          />
          <span className="min-w-0 flex-1">
            {item.label && <strong className="font-semibold">{item.label}: </strong>}
            {item.text}
          </span>
        </li>
      ))}
    </ul>
  );

  if (!isAlert) return list;

  // Sinais de alerta em destaque, como a caixa do manual impresso.
  return (
    <div className="flex gap-3 rounded-lg border border-[color-mix(in_srgb,var(--color-destructive)_28%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-destructive)_6%,transparent)] p-3.5">
      <TriangleAlert size={18} strokeWidth={2} className="mt-[3px] shrink-0 text-destructive" aria-hidden="true" />
      {list}
    </div>
  );
}

function AnswerImage({ image }: { image: KnowledgeImage }) {
  return (
    <figure className="flex flex-col gap-2">
      {/* `width`/`height` reservam o espaço antes de a imagem chegar: o texto
          de baixo não pula. `lazy`: com a resposta fechada, nada é baixado. */}
      <img
        src={image.src}
        alt={image.alt}
        width={image.width}
        height={image.height}
        loading="lazy"
        decoding="async"
        className="h-auto w-full rounded-lg border border-border bg-card"
      />
      {image.caption && <figcaption className="text-[13px]/[1.5] text-muted-foreground">{image.caption}</figcaption>}
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
    <div className="flex flex-col gap-3.5 text-[15px]/[1.65] text-foreground">
      {blocks.map((block, index) => (
        // A ordem dos trechos é fixa: o índice é uma chave estável aqui.
        <AnswerBlock key={index} block={block} />
      ))}
    </div>
  );
}
