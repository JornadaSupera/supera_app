import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import { SignupProvider } from './contexts/SignupContext';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <SignupProvider>
          <AppRoutes />
        </SignupProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
