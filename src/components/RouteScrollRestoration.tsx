import { useRouteScrollRestoration } from '../hooks/useRouteScrollRestoration';

/** Começa cada tela nova no topo e devolve a altura certa ao voltar. Não desenha nada. */
export default function RouteScrollRestoration() {
  useRouteScrollRestoration();
  return null;
}
