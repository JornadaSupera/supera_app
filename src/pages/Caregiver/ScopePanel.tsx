import { cva, type VariantProps } from 'class-variance-authority';
import { Check, ShieldCheck, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { CAREGIVER_SCOPES, NEVER_SHARED } from '../../utils/caregiverScopes';

// O escopo FIXO do acompanhante: o que ele vê e o que ele nunca vê, quando o
// banco ainda não tem o controle por área ([BANCO 32]).
//
// É o retrato fiel do que a RLS impõe hoje, e é por isso que ele existe no
// lugar de interruptores: sem o controle no banco, desligar uma área só na tela
// não esconderia nada. Quando o banco o tiver, `ScopeSwitches` toma este lugar
// sozinho — as duas telas perguntam ao banco antes de escolher qual mostrar.
//
// As duas listas saem do catálogo (`utils/caregiverScopes.ts`), o mesmo dos
// interruptores e da guarda das telas do acompanhante. A ficha clínica entrou
// no "Pode" em 28/09: o acompanhante já lia diagnóstico, plano e histórico, e a
// lista anterior não dizia — o titular autorizava sem saber.

const CAN = CAREGIVER_SCOPES.map(({ label, description }) => `${label}: ${description.toLowerCase()}`);

const panelVariants = cva('flex flex-col', {
  variants: {
    // `compact` entra no formulário de adicionar, onde tudo precisa caber numa
    // tela só: sem cartão em volta, tipografia menor e as duas listas lado a
    // lado — com os 8 px dos interruptores, que ocupam o mesmo lugar.
    compact: {
      true: 'gap-2',
      false: 'gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm',
    },
  },
  defaultVariants: { compact: false },
});

// No cartão, o ícone de 24 px fica a 12 px do texto, como o do título: as
// frases começam na mesma coluna dele.
const itemVariants = cva('flex items-start', {
  variants: {
    variant: {
      can: 'text-foreground',
      cannot: 'text-muted-foreground',
    },
    compact: {
      true: 'gap-2 text-caption font-medium',
      false: 'gap-3 text-body-sm',
    },
  },
  defaultVariants: { compact: false },
});

// Traço de 2 px, como os ícones do guia; o "Pode" em `teal-deep`. No cartão, o
// de 24 px fica centrado na primeira linha (`text-body-sm`, 21 px): a margem
// negativa põe o 1,5 px que sobra em cima e embaixo. No formulário, o de 18 px
// já tem a altura da linha da legenda.
const iconVariants = cva('shrink-0', {
  variants: {
    variant: {
      can: 'text-primary-deep',
      cannot: '',
    },
    compact: {
      true: '',
      false: '-my-[1.5px]',
    },
  },
  defaultVariants: { compact: false },
});

interface ScopeListProps extends Required<Pick<VariantProps<typeof itemVariants>, 'variant'>> {
  title: string;
  items: readonly string[];
  compact: boolean;
}

function ScopeList({ title, items, variant, compact }: ScopeListProps) {
  const Icon = variant === 'can' ? Check : X;

  return (
    <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
      <p className="text-caption font-semibold text-muted-foreground">{title}</p>
      <ul role="list" className={cn('flex flex-col', compact ? 'gap-1' : 'gap-2')}>
        {items.map((item) => (
          <li key={item} className={cn(itemVariants({ variant, compact }))}>
            <Icon
              size={compact ? 18 : 24}
              strokeWidth={2}
              className={cn(iconVariants({ variant, compact }))}
              aria-hidden="true"
            />
            {/* Os itens do "Não pode" vêm em minúscula para caber numa frase;
                aqui, numa lista, a primeira letra sobe. */}
            <span className="min-w-0 first-letter:uppercase">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface ScopePanelProps {
  /** Versão enxuta, para caber junto do formulário numa tela só. */
  compact?: boolean;
}

export default function ScopePanel({ compact = false }: ScopePanelProps) {
  return (
    <section className={cn(panelVariants({ compact }))}>
      <div className={cn('flex items-center', compact ? 'gap-2' : 'gap-3')}>
        <ShieldCheck
          size={compact ? 20 : 24}
          strokeWidth={2}
          className="shrink-0 text-primary-deep"
          aria-hidden="true"
        />
        <h2
          className={cn(
            'text-foreground',
            compact ? 'text-label font-semibold' : 'text-card-title font-bold'
          )}
        >
          O que essa pessoa pode ver
        </h2>
      </div>

      <div className={cn('flex gap-4', compact ? 'flex-row flex-wrap' : 'flex-col')}>
        <ScopeList title="Pode" items={CAN} variant="can" compact={compact} />
        <ScopeList title="Nunca vê" items={NEVER_SHARED} variant="cannot" compact={compact} />
      </div>

      <p className="text-caption font-medium text-muted-foreground">
        Quem cumpre estas regras é o servidor, a cada consulta. Revogar o acesso vale na hora.
      </p>
    </section>
  );
}
