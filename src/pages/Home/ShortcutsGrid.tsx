import { Calendar, Library, User, type LucideIcon } from 'lucide-react';
import NavigationRow from '../../components/ui/navigation-row';
import SectionHeading from '../../components/ui/section-heading';
import { useScopeFilter } from '../../hooks/useCaregiver';
import { SCOPE_BY_TAB_PATH } from '../../utils/caregiverScopes';

interface Shortcut {
  label: string;
  to: string;
  icon: LucideIcon;
}

/**
 * Os três atalhos que o produto define para a Home: Agenda, Orientações e
 * Perfil. O Diário já tem o card do registro de hoje logo acima, e o Chat
 * tem a aba da barra inferior — que avisa mensagem nova em qualquer tela.
 *
 * Os ícones espelham os da barra inferior para o mesmo destino (Agenda e
 * Perfil). Orientações fica com `Library`, que é o próprio título da tela
 * ("Biblioteca") e não colide com nenhuma aba. Cada atalho é uma linha de
 * lista do modelo da Início no guia — a `NavigationRow`, a mesma do Perfil:
 * card branco de 14 px, ícone de traço no verde escuro, sem pastilha, e a
 * seta à direita. Todos iguais: são o mesmo
 * tipo de elemento, e cores diferentes lado a lado sugeririam uma hierarquia
 * que não existe.
 */
const SHORTCUTS: Shortcut[] = [
  { label: 'Agenda', to: '/agenda', icon: Calendar },
  { label: 'Orientações', to: '/orientacoes', icon: Library },
  { label: 'Perfil', to: '/perfil', icon: User },
];

export default function ShortcutsGrid() {
  // O acompanhante não vê atalho para área que o titular retirou.
  const isVisible = useScopeFilter();
  const shortcuts = SHORTCUTS.filter((item) => isVisible(SCOPE_BY_TAB_PATH[item.to]));

  return (
    // `mt-2`: somado ao vão de 24 px da Home, dá os 32 px do guia entre seções.
    <section aria-labelledby="home-shortcuts-title" className="mt-2 flex flex-col gap-3">
      <SectionHeading id="home-shortcuts-title">Atalhos</SectionHeading>

      <div className="flex flex-col gap-2">
        {shortcuts.map(({ label, to, icon }) => (
          <NavigationRow key={to} to={to} icon={icon} title={label} density="compact" />
        ))}
      </div>
    </section>
  );
}
