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
    // lado.
    compact: {
      true: 'gap-2.5',
      false: 'gap-4 rounded-2xl border border-border bg-card p-4',
    },
  },
  defaultVariants: { compact: false },
});

const itemVariants = cva('flex items-start gap-2', {
  variants: {
    variant: {
      can: 'text-foreground',
      cannot: 'text-muted-foreground',
    },
    compact: {
      true: 'text-[12px]/[1.35]',
      false: 'text-[14px]/[1.45]',
    },
  },
  defaultVariants: { compact: false },
});

const iconVariants = cva('mt-0.5 shrink-0', {
  variants: {
    variant: {
      can: 'text-[var(--color-supera-seguranca)]',
      cannot: '',
    },
  },
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
      <p className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">{title}</p>
      <ul role="list" className={cn('flex flex-col', compact ? 'gap-1' : 'gap-2')}>
        {items.map((item) => (
          <li key={item} className={cn(itemVariants({ variant, compact }))}>
            <Icon
              size={compact ? 13 : 16}
              strokeWidth={variant === 'can' ? 2.5 : 2.25}
              className={cn(iconVariants({ variant }))}
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
      <div className="flex items-center gap-2">
        <ShieldCheck
          size={compact ? 15 : 18}
          strokeWidth={2}
          className="shrink-0 text-[var(--color-supera-seguranca)]"
          aria-hidden="true"
        />
        <h2 className={cn('font-semibold text-foreground', compact ? 'text-[13px]' : 'text-[14px]')}>
          O que essa pessoa pode ver
        </h2>
      </div>

      <div className={cn('flex gap-4', compact ? 'flex-row flex-wrap' : 'flex-col')}>
        <ScopeList title="Pode" items={CAN} variant="can" compact={compact} />
        <ScopeList title="Nunca vê" items={NEVER_SHARED} variant="cannot" compact={compact} />
      </div>

      <p className={cn('text-muted-foreground', compact ? 'text-[11px]/[1.4]' : 'text-[12px]/[1.5]')}>
        Quem cumpre estas regras é o servidor, a cada consulta. Revogar o acesso vale na hora.
      </p>
    </section>
  );
}
