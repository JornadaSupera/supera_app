import { Link } from 'react-router';
import { Calendar, Library, User, type LucideIcon } from 'lucide-react';
import IconTile from '../../components/ui/icon-tile';
import SectionHeading from '../../components/ui/section-heading';

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
 * ("Biblioteca") e não colide com nenhuma aba. Todos na mesma pastilha verde
 * da marca: são o mesmo tipo de elemento, e cores diferentes lado a lado
 * sugeririam uma hierarquia que não existe.
 */
const SHORTCUTS: Shortcut[] = [
  { label: 'Agenda', to: '/agenda', icon: Calendar },
  { label: 'Orientações', to: '/orientacoes', icon: Library },
  { label: 'Perfil', to: '/perfil', icon: User },
];

export default function ShortcutsGrid() {
  return (
    <section aria-labelledby="home-shortcuts-title" className="flex flex-col gap-3">
      <SectionHeading id="home-shortcuts-title">Atalhos</SectionHeading>

      <div className="grid grid-cols-3 gap-3">
        {SHORTCUTS.map(({ label, to, icon }) => (
          <Link
            key={to}
            to={to}
            className="flex min-h-[104px] flex-col items-center justify-center gap-2.5 rounded-[20px] border border-border bg-card p-3 shadow-[var(--shadow-raised)] transition-[scale,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:shadow-[var(--shadow-raised-strong)] active:scale-[0.97] active:shadow-[var(--shadow-raised-strong)] motion-reduce:active:scale-100"
          >
            <IconTile icon={icon} size="sm" />
            <span className="text-center text-[13px] font-semibold text-foreground">{label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
