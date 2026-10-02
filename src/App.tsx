import { BrowserRouter } from 'react-router';
import { ToastProvider } from './contexts/ToastContext';
import DesktopShell from './components/ui/desktop-shell';
import AppErrorBoundary from './components/AppErrorBoundary';
import BiometricGate from './components/BiometricGate';
import RequireAccountName from './components/RequireAccountName';
import PushOpenHandler from './components/PushOpenHandler';
import AppUpdateGate from './pages/AppUpdate/AppUpdateGate';
import AppRoutes from './routes/AppRoutes';

// A ordem dos portões importa.
//
// A biometria vem primeiro porque é a tranca: nada — nem o pedido de nome nem
// a versão nova — pode aparecer antes de saber quem está segurando o aparelho.
// A versão nova vem em seguida e vale também para quem ainda não entrou. O
// nome vem por último porque só faz sentido para uma sessão já confirmada.
//
// Os três ficam acima das rotas, e não dentro de `RequireAuth`, porque não são
// guarda de rota: valem para o app inteiro, inclusive para a Splash, que é
// justamente quem manda o app direto para a Home quando há sessão guardada.
export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        {/* Dentro do roteador e do toast: navega e marca como lida. */}
        <PushOpenHandler />
        <DesktopShell>
          {/* Envolve também os portões: um erro na tranca ou no pedido de nome
              deixaria a mesma tela branca que um erro de rota. */}
          <AppErrorBoundary>
            <BiometricGate>
              <AppUpdateGate>
                <RequireAccountName>
                  <AppRoutes />
                </RequireAccountName>
              </AppUpdateGate>
            </BiometricGate>
          </AppErrorBoundary>
        </DesktopShell>
      </ToastProvider>
    </BrowserRouter>
  );
}
