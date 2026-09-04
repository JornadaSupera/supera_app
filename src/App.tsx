import { BrowserRouter } from 'react-router';
import { ToastProvider } from './contexts/ToastContext';
import DesktopShell from './components/ui/desktop-shell';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <DesktopShell>
          <AppRoutes />
        </DesktopShell>
      </ToastProvider>
    </BrowserRouter>
  );
}
