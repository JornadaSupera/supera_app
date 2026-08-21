import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import { CadastroProvider } from './contexts/CadastroContext';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <CadastroProvider>
          <AppRoutes />
        </CadastroProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
