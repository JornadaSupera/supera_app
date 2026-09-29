import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useMarkNotificationRead } from '../hooks/useNotifications';
import { usePushOpenStore } from '../stores/pushOpenStore';
import { useSessionStore } from '../stores/sessionStore';
import { getDestinoNotificacao } from '../utils/notifications';

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
    if (!pending || status === 'verificando') return;

    clear();
    if (status !== 'autenticado') return;

    if (pending.notificationId) markRead(pending.notificationId);
    navigate(getDestinoNotificacao(pending.targetTable, pending.targetId) ?? '/notificacoes');
  }, [pending, status, clear, markRead, navigate]);

  return null;
}
