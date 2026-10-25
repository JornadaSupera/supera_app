import type { ComponentType } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>;

// O seletor em cápsula da Agenda (Mensal/Semanal/Lista) e dos Avisos
// (Recebidas/Arquivadas), com as mesmas classes: botão de 40 px com o texto de
// rótulo do guia (`text-label`, 14/20), e o `after` estende o toque pelos 4 px
// do trilho, até os 48 px. O fio na opção escolhida: no tema escuro o card e o
// trilho têm a mesma cor, e a escolha não pode ser só a cor do texto.
const segmentVariants = cva(
  'relative inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border-none bg-transparent px-4 text-label font-semibold text-muted-foreground transition-[background-color,color] duration-150 ease-[ease] after:absolute after:inset-x-0 after:-inset-y-1',
  {
    variants: {
      selected: {
        true: 'bg-card text-primary-deep shadow-sm ring-1 ring-border',
        false: '',
      },
    },
    defaultVariants: { selected: false },
  }
);

export interface SegmentedOption<Key extends string> {
  key: Key;
  label: string;
  icon?: IconComponent;
}

export interface SegmentedControlProps<Key extends string> {
  options: readonly SegmentedOption<Key>[];
  value: Key;
  onChange: (key: Key) => void;
  /** O que o grupo escolhe, para o leitor de tela (ex.: "Visão da agenda"). */
  'aria-label': string;
  className?: string;
}

/**
 * Troca entre visões da mesma tela. Um grupo de botões de alternância
 * (`aria-pressed`), como na Agenda e nos Avisos: cada opção é uma parada do
 * Tab e diz se está escolhida.
 */
export default function SegmentedControl<Key extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  className,
}: SegmentedControlProps<Key>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('flex items-center gap-1 rounded-full bg-muted p-1', className)}
    >
      {options.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          className={segmentVariants({ selected: value === key })}
          onClick={() => onChange(key)}
        >
          {Icon && <Icon size={18} strokeWidth={2} aria-hidden />}
          {label}
        </button>
      ))}
    </div>
  );
}
