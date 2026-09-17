import { BrowserRouter } from 'react-router';
import { ToastProvider } from './contexts/ToastContext';
import DesktopShell from './components/ui/desktop-shell';
import BiometricGate from './components/BiometricGate';
import RequireAccountName from './components/RequireAccountName';
import AppRoutes from './routes/AppRoutes';

// A ordem dos dois portões importa.
//
// A biometria vem primeiro porque é a tranca: nada — nem o pedido de nome —
// pode aparecer antes de saber quem está segurando o aparelho. O nome vem
// depois porque só faz sentido para uma sessão já confirmada.
//
// Os dois ficam acima das rotas, e não dentro de `RequireAuth`, porque não são
// guarda de rota: valem para o app inteiro, inclusive para a Splash, que é
// justamente quem manda o app direto para a Home quando há sessão guardada.
export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <DesktopShell>
          <BiometricGate>
            <RequireAccountName>
              <AppRoutes />
            </RequireAccountName>
          </BiometricGate>
        </DesktopShell>
      </ToastProvider>
    </BrowserRouter>
  );
}
