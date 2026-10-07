import * as React from 'react';
import { cva } from 'class-variance-authority';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import flowerClump from '@/assets/design/flower-clump.webp';
import flowerBranch from '@/assets/design/flower-branch.webp';
import Button, { type ButtonProps } from './button';
import AffectivePhrase from './affective-phrase';

type IconComponent = React.ComponentType<{
  size?: number;
  strokeWidth?: number;
  'aria-hidden'?: boolean;
}>;

interface EmptyStateBaseProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: IconComponent;
  iconTone?: string;
  title?: string;
  description?: string;
  /**
   * Troca o ícone pela pintura da touceira de flores (`touceira-flores` do guia
   * da clínica). Toda tela vazia de lista leva a touceira e a frase de apoio
   * (pedido de 06/10): Diário, Agenda, Notificações, Orientações, a pesquisa
   * de satisfação e a lista do Chat (por pedido dela, acima do guia). Nunca em
   * alertas, formulários, dentro da conversa ou na leitura de uma orientação.
   */
  illustration?: boolean;
  /**
   * Largura da touceira: `md` (170 px) por padrão; `sm` (140 px, o mínimo do
   * guia) nas telas de cabeçalho alto, para o texto não ficar atrás da barra
   * de abas.
   */
  illustrationSize?: 'md' | 'sm';
  /**
   * Qual pintura: a touceira de flores (padrão) ou o ramo em flor do pacote
   * da clínica, mais baixo e largo — o do aviso compacto da Agenda (07/10).
   */
  illustrationArt?: 'clump' | 'branch';
  /**
   * Variante do botão da ação. Primário por padrão; `outline` quando a tela já
   * tem o seu botão principal (o "Novo registro" do Diário): o guia pede um só
   * por tela.
   */
  actionVariant?: ButtonProps['variant'];
  /**
   * Frase de apoio da caderneta (`CARE_PHRASES`), à mão, logo abaixo da
   * pintura: só em telas vazias que são um momento emocional.
   */
  phrase?: string;
}

/**
 * Ação é tudo ou nada: rótulo e handler juntos, ou nenhum dos dois. Com os
 * dois opcionais soltos, passar só um compilava e o botão simplesmente não
 * aparecia — erro silencioso que agora o TypeScript acusa.
 */
type EmptyStateActionProps =
  | { actionLabel: string; onAction: () => void }
  | { actionLabel?: never; onAction?: never };

export type EmptyStateProps = EmptyStateBaseProps & EmptyStateActionProps;

// O guia pede a touceira entre 140 e 200 px de largura. O ramo, deitado, vai
// mais largo para ter a mesma presença.
const illustrationVariants = cva('mb-1 h-auto select-none', {
  variants: {
    size: { md: '', sm: '' },
    art: { clump: '', branch: '' },
  },
  compoundVariants: [
    { art: 'clump', size: 'md', class: 'w-[170px]' },
    { art: 'clump', size: 'sm', class: 'w-[140px]' },
    { art: 'branch', size: 'md', class: 'w-[220px]' },
    { art: 'branch', size: 'sm', class: 'w-[180px]' },
  ],
  defaultVariants: { size: 'md', art: 'clump' },
});

/** Os arquivos das pinturas, com o tamanho real (reserva o espaço antes de carregar). */
const ILLUSTRATIONS = {
  clump: { src: flowerClump, width: 650, height: 700 },
  branch: { src: flowerBranch, width: 1300, height: 600 },
} as const;

export default function EmptyState({
  icon: Icon = Inbox,
  iconTone,
  title = 'Nada por aqui ainda',
  description,
  illustration = false,
  illustrationSize,
  illustrationArt = 'clump',
  actionVariant,
  phrase,
  actionLabel,
  onAction,
  className,
  style,
  ...rest
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-[50vh] flex-col items-center justify-center gap-3 px-5 py-8 text-center',
        className
      )}
      // Exceção deliberada ao "nunca style inline": a cor do ícone varia por
      // instância (`iconTone`), sem classe Tailwind estática equivalente —
      // mesmo padrão de `--badge-color`/`--tag-color` em badge.tsx/tag.tsx.
      style={iconTone ? ({ ...style, '--icon-tone': iconTone } as React.CSSProperties) : style}
      {...rest}
    >
      {illustration ? (
        // Decorativa (`alt` vazio). `width`/`height` reservam o espaço antes de
        // a imagem chegar.
        <img
          src={ILLUSTRATIONS[illustrationArt].src}
          alt=""
          width={ILLUSTRATIONS[illustrationArt].width}
          height={ILLUSTRATIONS[illustrationArt].height}
          className={illustrationVariants({ size: illustrationSize, art: illustrationArt })}
        />
      ) : (
        <span
          className={cn(
            'mb-1 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground',
            iconTone &&
              'bg-[color-mix(in_srgb,var(--icon-tone)_10%,transparent)] text-[var(--icon-tone)]'
          )}
        >
          <Icon size={28} strokeWidth={2} aria-hidden />
        </span>
      )}
      {/* Título `text-title` (20/26) e frase `text-body-sm` (14/21): a tela
          vazia do guia da clínica, um ponto abaixo dele. */}
      {phrase && <AffectivePhrase className="mb-2 max-w-[300px]">{phrase}</AffectivePhrase>}
      <p className="text-title font-bold text-foreground">{title}</p>
      {description && (
        <p className="max-w-[280px] text-body-sm text-muted-foreground">{description}</p>
      )}
      {actionLabel && onAction && (
        <div className="mt-2">
          <Button variant={actionVariant} onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
