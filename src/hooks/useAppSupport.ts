import { useMutation } from '@tanstack/react-query';
import { prepareWhatsApp, type WhatsAppLaunch } from '../services/whatsapp';
import { APP_SUPPORT } from '../lib/clinicContacts';
import { useToast } from '../contexts/ToastContext';

// O suporte técnico do aplicativo, pelo WhatsApp, com a mensagem pronta. Nada
// vai ao banco nem leva dado do paciente: só diz que a pessoa veio do app.

/**
 * Abre o WhatsApp do suporte. `open` precisa ser chamado NO TOQUE: no
 * computador, a aba do WhatsApp Web é reservada ali (ver `prepareWhatsApp`).
 */
export function useAppSupportWhatsApp() {
  const { showToast } = useToast();

  const mutation = useMutation({
    mutationFn: async (launch: WhatsAppLaunch) => {
      if (!(await launch.open(APP_SUPPORT.whatsappE164, APP_SUPPORT.message))) {
        throw new Error(`Não foi possível abrir o WhatsApp. Fale com o suporte pelo ${APP_SUPPORT.display}.`);
      }
    },
    onError: (error, launch) => {
      launch.cancel();
      showToast(error.message, { variant: 'error' });
    },
  });

  return {
    isPending: mutation.isPending,
    open: () => mutation.mutate(prepareWhatsApp()),
  };
}
