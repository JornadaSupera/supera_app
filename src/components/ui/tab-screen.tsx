import type { ReactNode } from 'react';
import BottomTab from './bottom-tab';

export interface TabScreenProps {
  /** Normalmente um `TabHeader`. Sai quando a tela ainda não sabe o que mostrar no topo. */
  header?: ReactNode;
  children: ReactNode;
}

/**
 * Moldura das telas de aba: cabeçalho fixo em cima, conteúdo no meio e a barra
 * de navegação embaixo.
 *
 * Existe por dois motivos. O primeiro é que as seis abas repetiam a mesma
 * marcação. O segundo importa mais: **todo** estado da tela — conteúdo, vazio
 * ou erro — precisa manter a barra de navegação. No iOS não há voltar do
 * sistema, e uma tela de erro sem a barra deixava o paciente sem saída.
 */
export default function TabScreen({ header, children }: TabScreenProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {header}
      {children}
      <BottomTab />
    </div>
  );
}
