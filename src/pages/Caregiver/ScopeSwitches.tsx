import { useId } from 'react';
import { BookOpen, Calendar, FileHeart, Library, MessageCircle, type LucideIcon } from 'lucide-react';
import Switch from '../../components/ui/switch';
import { cn } from '../../lib/utils';
import { CAREGIVER_SCOPES, NEVER_SHARED } from '../../utils/caregiverScopes';
import { formatDateBr } from '../../utils/date';
import type { CaregiverScope } from '../../types';

/** O ícone de cada área — o mesmo da aba ou da seção que ela libera. */
const SCOPE_ICONS: Record<CaregiverScope, LucideIcon> = {
  schedule: Calendar,
  diary: BookOpen,
  chat: MessageCircle,
  resources: Library,
  clinical_record: FileHeart,
};

interface ScopeSwitchesProps {
  /** Se cada área está liberada. */
  values: Record<CaregiverScope, boolean>;
  onChange: (scope: CaregiverScope, enabled: boolean) => void;
  /** Desde quando vale a situação de cada área — só na gestão, quando o banco informa. */
  since?: Partial<Record<CaregiverScope, string | null>>;
  /**
   * As áreas cuja mudança está a caminho do servidor: o interruptor de cada uma
   * espera a resposta. Um conjunto, e não uma área só — o titular pode tocar em
   * duas seguidas, e a primeira não pode voltar a ficar livre enquanto a
   * mudança dela ainda está no ar.
   */
  pendingScopes?: ReadonlySet<CaregiverScope>;
  disabled?: boolean;
  /** Sem cartão em volta: dentro do formulário de adicionar, onde tudo cabe numa tela. */
  compact?: boolean;
}

/**
 * As áreas que o acompanhante pode ver, uma por interruptor, mais o que ele
 * nunca vê.
 *
 * Só aparece quando o banco tem o controle por área ([BANCO 32]): cada
 * interruptor corresponde a um grupo de políticas que a RLS passa a cumprir.
 * Antes disso, quem mostra o escopo é o `ScopePanel` — a lista fixa, que é a
 * verdade de hoje.
 *
 * Cada linha é um `role="switch"` nativo, com o nome e a descrição da área
 * como rótulo: teclado, leitor de tela e toque funcionam sem nada a mais, e a
 * linha inteira é o alvo do toque.
 */
export default function ScopeSwitches({
  values,
  onChange,
  since,
  pendingScopes,
  disabled = false,
  compact = false,
}: ScopeSwitchesProps) {
  const headingId = useId();
  // Prefixo único por instância: com um `id` fixo por área, duas listas na
  // mesma página repetiriam o `id`, e o rótulo de uma acionaria o interruptor
  // da outra.
  const switchIdPrefix = useId();
  const enabledCount = CAREGIVER_SCOPES.filter(({ scope }) => values[scope]).length;

  return (
    <section
      aria-labelledby={headingId}
      className={cn('flex flex-col', compact ? 'gap-2' : 'gap-3 rounded-2xl border border-border bg-card p-4')}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-[14px] font-semibold text-foreground">
          O que essa pessoa pode ver
        </h2>
        <span className="shrink-0 text-[12px] text-muted-foreground">
          {enabledCount} de {CAREGIVER_SCOPES.length}
        </span>
      </div>

      <ul role="list" className={cn('flex flex-col', !compact && '-mx-1')}>
        {CAREGIVER_SCOPES.map(({ scope, label, description }) => {
          const Icon = SCOPE_ICONS[scope];
          const enabled = values[scope];
          const sinceDate = since?.[scope];

          return (
            <li key={scope} className="border-b border-border last:border-b-0">
              <Switch
                id={`${switchIdPrefix}-${scope}`}
                checked={enabled}
                disabled={disabled || (pendingScopes?.has(scope) ?? false)}
                onChange={(checked) => onChange(scope, checked)}
                className="min-h-[56px] px-1 py-2"
                label={
                  <span className="flex items-center gap-3">
                    <Icon
                      size={18}
                      strokeWidth={2}
                      className={cn('shrink-0', enabled ? 'text-[var(--color-supera-seguranca)]' : 'text-muted-foreground')}
                      aria-hidden="true"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className={cn('text-[14px] font-medium', enabled ? 'text-foreground' : 'text-muted-foreground')}>
                        {label}
                      </span>
                      <span className="text-[12px]/[1.35] text-muted-foreground">
                        {description}
                        {sinceDate && (
                          <>
                            {' · '}
                            {enabled ? 'liberada' : 'retirada'} em {formatDateBr(sinceDate)}
                          </>
                        )}
                      </span>
                    </span>
                  </span>
                }
              />
            </li>
          );
        })}
      </ul>

      <p className="text-[12px]/[1.45] text-muted-foreground">
        <span className="font-medium text-foreground">Nunca vê:</span> {NEVER_SHARED.join('; ')}.
      </p>
    </section>
  );
}
