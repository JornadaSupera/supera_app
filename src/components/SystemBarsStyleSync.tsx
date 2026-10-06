import { useSystemBarsStyle } from '../hooks/useSystemBarsStyle';

/** Mantém os ícones das barras do sistema legíveis sobre a tela atual. Não desenha nada. */
export default function SystemBarsStyleSync() {
  useSystemBarsStyle();
  return null;
}
