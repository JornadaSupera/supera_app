import { cva, type VariantProps } from 'class-variance-authority';
import { Check, ShieldCheck, X } from 'lucide-react';
import { cn } from '../../lib/utils';

// O que o acompanhante pode e não pode — o escopo do contrato (mapa §7).
//
// É texto fixo: o escopo é o mesmo para qualquer acompanhante, e o banco é
// quem o impõe. Por isso a tela só o descreve.

const CAN = [
  'Ver a sua agenda e os lembretes',
  'Ver as orientações da equipe',
  'Conversar com a equipe no chat',
  'Ver e ajudar a registrar o diário',
];

const CANNOT = [
  'Revogar a LGPD, exportar ou excluir a conta',
  'Trocar a sua senha',
  'Gerenciar o próprio vínculo',
];

/**
 * O contrato diz que o acompanhante não vê conteúdo sigiloso (ex.: psicologia).
 * Hoje as políticas do acompanhante não filtram a visibilidade ([BANCO 27]), e
 * a tela não pode prometer o que o banco não cumpre. Ligar quando o [BANCO 27]
 * estiver aplicado.
 */
const PROMISE_CONFIDENTIALITY = false;

const CANNOT_WITH_CONFIDENTIALITY = ['Ver conteúdo sigiloso, como o da psicologia', ...CANNOT];

const itemVariants = cva('flex items-start gap-2.5 text-[14px]/[1.45]', {
  variants: {
    variant: {
      can: 'text-foreground',
      cannot: 'text-muted-foreground',
    },
  },
});

const iconVariants = cva('shrink-0', {
  variants: {
    variant: {
      can: 'mt-0.5 text-[var(--color-supera-seguranca)]',
      cannot: 'mt-0.5',
    },
  },
});

interface ScopeListProps extends Required<VariantProps<typeof itemVariants>> {
  title: string;
  items: string[];
}

function ScopeList({ title, items, variant }: ScopeListProps) {
  const Icon = variant === 'can' ? Check : X;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">{title}</p>
      <ul role="list" className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item} className={cn(itemVariants({ variant }))}>
            <Icon
              size={16}
              strokeWidth={variant === 'can' ? 2.5 : 2.25}
              className={cn(iconVariants({ variant }))}
              aria-hidden="true"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ScopePanel() {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <ShieldCheck size={18} strokeWidth={2} className="text-[var(--color-supera-seguranca)]" aria-hidden="true" />
        <h2 className="text-[14px] font-semibold text-foreground">O que o acompanhante pode e não pode</h2>
      </div>

      <ScopeList title="Pode" items={CAN} variant="can" />
      <ScopeList
        title="Não pode"
        items={PROMISE_CONFIDENTIALITY ? CANNOT_WITH_CONFIDENTIALITY : CANNOT}
        variant="cannot"
      />
    </section>
  );
}
