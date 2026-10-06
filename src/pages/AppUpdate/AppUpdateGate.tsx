import { useCallback, type ReactNode } from 'react';
import AppUpdateScreen from './AppUpdateScreen';
import { useStoreUpdate } from '../../hooks/useAppUpdate';
import { useAppUpdateStore } from '../../stores/appUpdateStore';
import { isUpdateSnoozed } from '../../utils/appUpdate';

/**
 * Mostra a tela de versão nova por cima do app quando a loja do aparelho tem
 * uma versão mais nova que a instalada. Sem versão nova, sem resposta da loja
 * ou na Web, é transparente.
 *
 * Fica abaixo da biometria (nada aparece antes da tranca) e acima do pedido
 * de nome e das rotas: vale para o app inteiro, inclusive para quem ainda não
 * entrou.
 */
export default function AppUpdateGate({ children }: { children: ReactNode }) {
  const { data: update, dataUpdatedAt } = useStoreUpdate();
  const snooze = useAppUpdateStore((state) => state.snooze);
  const snoozeVersion = useAppUpdateStore((state) => state.snoozeVersion);

  const version = update?.version;
  const handleLater = useCallback(() => {
    if (version) snoozeVersion(version);
  }, [version, snoozeVersion]);

  // O prazo do "depois" é medido na hora da última conferência da loja, e não
  // no relógio do render: cada conferência nova (ao voltar para o app, de
  // hora em hora) redesenha o portão, e é nela que a tela volta.
  const showScreen = update && !isUpdateSnoozed(snooze, update.version, dataUpdatedAt);

  return (
    <>
      {children}
      {showScreen && <AppUpdateScreen store={update.store} onLater={handleLater} />}
    </>
  );
}
