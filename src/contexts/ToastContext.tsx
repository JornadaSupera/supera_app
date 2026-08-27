import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Toast, { TOAST_VIEWPORT_CLASS } from '../components/ui/toast';
import type { ToastVariant } from '../components/ui/toast';

export type { ToastVariant };

export interface ToastOptions {
  variant?: ToastVariant;
  /** Milissegundos até sumir sozinho. `0` mantém o toast até ser fechado. */
  duration?: number;
}

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  /** Exibe um toast e devolve o id gerado. */
  showToast: (message: string, options?: ToastOptions) => number;
  dismissToast: (id: number) => void;
}

// Tipado como `ToastContextValue | null` em vez de só `null`: com `null` puro,
// o TypeScript estreita o retorno de `useToast()` para `never` depois do guard
// abaixo, e qualquer uso de `showToast` num arquivo `.tsx` vira erro.
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const { variant = 'default', duration = 3500 } = options;
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, variant }]);
      if (duration > 0) {
        setTimeout(() => dismissToast(id), duration);
      }
      return id;
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {createPortal(
        <div className={TOAST_VIEWPORT_CLASS}>
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              message={toast.message}
              variant={toast.variant}
              onClose={() => dismissToast(toast.id)}
            />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast deve ser usado dentro de um ToastProvider');
  }
  return context;
}
