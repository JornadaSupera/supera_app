import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useMarkNotificationRead } from '../hooks/useNotifications';
import { usePushOpenStore } from '../stores/pushOpenStore';
import { useSessionStore } from '../stores/sessionStore';
import { getNotificationDestination } from '../utils/notifications';

/**
 * Abre a tela do push que a pessoa tocou e marca a notificação como lida.
 *
 * Espera a sessão ser lida: antes disso o portão de rota mandaria ao login, e o
 * destino se perderia. Só abre com a sessão de quem tem vínculo — sem vínculo
 * (ou sem sessão) o push nem deveria ter vindo, e a tela de espera ou o login
 * seguem sendo o lugar certo. Área do acompanhante desligada fica com o
 * `ScopeGate` da própria rota.
 *
 * Tipo que o app não sabe abrir vai para a Central de notificações, em vez de
 * uma rota inventada. Não desenha nada.
 */
export default function PushOpenHandler() {
  const navigate = useNavigate();
  const pending = usePushOpenStore((state) => state.pending);
  const clear = usePushOpenStore((state) => state.clear);
  const status = useSessionStore((state) => state.status);
  const { mutate: markRead } = useMarkNotificationRead();

  useEffect(() => {
    // Sem rede na abertura (`unreachable`) a sessão ainda vai se confirmar:
    // o toque fica guardado até lá, como na leitura do cofre.
    if (!pending || status === 'checking' || status === 'unreachable') return;

    clear();
    if (status !== 'authenticated') return;

    if (pending.notificationId) markRead(pending.notificationId);
    navigate(getNotificationDestination(pending.targetTable, pending.targetId) ?? '/notificacoes');
  }, [pending, status, clear, markRead, navigate]);

  return null;
}
