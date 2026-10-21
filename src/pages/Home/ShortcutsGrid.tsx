import { Bell, BookOpenText, Library, Sparkles, type LucideIcon } from 'lucide-react';
import NavigationRow from '../../components/ui/navigation-row';
import SectionHeading from '../../components/ui/section-heading';
import { useScopeFilter } from '../../hooks/useCaregiver';
import { useContentAssistantSettings } from '../../hooks/useContentAssistant';
import { SCOPE_BY_TAB_PATH } from '../../utils/caregiverScopes';
import type { CaregiverScope } from '../../types';

interface Shortcut {
  label: string;
  to: string;
  icon: LucideIcon;
  /** A área do acompanhante, quando o endereço não é o de uma aba. */
  scope?: CaregiverScope;
}

/**
 * Os atalhos da Home levam ao que NÃO está na barra de abas (decisão de
 * 06/10): Orientações, Central de Conhecimento e Notificações. Agenda e
 * Perfil, os atalhos de antes, só repetiam a barra logo abaixo. O Diário já
 * tem o card do registro de hoje acima, e o Chat a aba que avisa mensagem
 * nova em qualquer tela.
 *
 * Os ícones são os das próprias telas: `Library` para a "Biblioteca" de
 * Orientações, `BookOpenText` como na linha da Central no Perfil e o sino das
 * notificações. Cada atalho é uma linha de lista do modelo da Início no guia —
 * a `NavigationRow`, a mesma do Perfil: card branco de 14 px, ícone de traço
 * no verde escuro, sem pastilha, e a seta à direita. Todos iguais: são o mesmo
 * tipo de elemento, e cores diferentes lado a lado sugeririam uma hierarquia
 * que não existe.
 */
const SHORTCUTS: Shortcut[] = [
  { label: 'Orientações', to: '/orientacoes', icon: Library },
  { label: 'Central de Conhecimento', to: '/perfil/conhecimento', icon: BookOpenText },
  { label: 'Notificações', to: '/notificacoes', icon: Bell },
];

/**
 * O assistente com IA, logo depois de Orientações: só com a chave da clínica
 * ligada (`ai_assistant_enabled`), e com a área das orientações.
 */
const ASSISTANT_SHORTCUT: Shortcut = {
  label: 'Pergunte à IA',
  to: '/orientacoes/assistente',
  icon: Sparkles,
  scope: 'resources',
};

export default function ShortcutsGrid() {
  // O acompanhante não vê atalho para área que o titular retirou.
  const isVisible = useScopeFilter();
  const { data: assistantSettings } = useContentAssistantSettings();
  const candidates = assistantSettings?.enabled
    ? [SHORTCUTS[0], ASSISTANT_SHORTCUT, ...SHORTCUTS.slice(1)]
    : SHORTCUTS;
  const shortcuts = candidates.filter((item) => isVisible(item.scope ?? SCOPE_BY_TAB_PATH[item.to]));

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
