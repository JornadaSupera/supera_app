import { Link } from 'react-router';
import { Calendar, Library, User, type LucideIcon } from 'lucide-react';

/**
 * Bolha do ícone do atalho.
 *
 * Uma classe única, sem cor por atalho: os atalhos são o mesmo tipo de
 * elemento, e cores de marca diferentes lado a lado sugeriam uma hierarquia
 * que não existe. O verde vem do token da marca (`--color-primary`) na mesma
 * fórmula de 15% que todas as outras bolhas de ícone do app usam — então
 * funciona igual no tema claro e no escuro.
 */
const SHORTCUT_ICON_CLASS =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-primary';

interface Shortcut {
  label: string;
  to: string;
  icon: LucideIcon;
}

/**
 * Os três atalhos que o produto define para a Home: Agenda, Orientações e
 * Perfil. O Diário já tem o card "Como você está hoje?" logo acima, e o Chat
 * tem a aba da barra inferior — que avisa mensagem nova em qualquer tela.
 *
 * Os ícones espelham os da barra inferior para o mesmo destino (Agenda e
 * Perfil). Orientações fica com `Library`, que é o próprio título da tela
 * ("Biblioteca") e não colide com nenhuma aba.
 */
const SHORTCUTS: Shortcut[] = [
  { label: 'Agenda', to: '/agenda', icon: Calendar },
  { label: 'Orientações', to: '/orientacoes', icon: Library },
  { label: 'Perfil', to: '/perfil', icon: User },
];

export default function ShortcutsGrid() {
  return (
    <section>
      <h3 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
        Atalhos
      </h3>

      <div className="grid grid-cols-3 gap-3">
        {SHORTCUTS.map(({ label, to, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm"
          >
            <span className={SHORTCUT_ICON_CLASS}>
              <Icon size={16} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="text-center text-[11px] font-medium text-foreground">{label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
