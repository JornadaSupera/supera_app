import { useMutation, useQuery } from '@tanstack/react-query';
import { authenticateWithBiometric, isBiometricAvailable } from '../services/biometric';
import { getBiometricSupport } from '../services/biometricSupport';
import { useDevicePreferencesStore } from '../stores/devicePreferencesStore';
import { useToast } from '../contexts/ToastContext';

// Hooks de biometria. Capacidade do APARELHO, não dado de paciente — mas a
// tela ainda não deve falar com `services/` direto (Regra nº9), então ganham
// hook como qualquer outra leitura/ação.

/** Se este aparelho tem biometria disponível (Face ID, Touch ID, impressão digital). */
export function useBiometricAvailable() {
  return useQuery({
    queryKey: ['biometric-available'],
    queryFn: isBiometricAvailable,
  });
}

/**
 * A biometria deste aparelho: se dá para ligar e qual é (`null` no navegador).
 * Sem `staleTime`: quem cadastra a digital nos ajustes e volta ao app vê a
 * opção destravar.
 */
export function useBiometricSupport() {
  return useQuery({
    queryKey: ['biometric-support'],
    queryFn: getBiometricSupport,
  });
}

/**
 * Pede a confirmação biométrica nativa. Devolve `false` — não lança — se
 * recusada, cancelada pelo usuário ou indisponível; ver `services/biometric.js`.
 */
export function useBiometricAuthentication() {
  return useMutation({
    mutationFn: authenticateWithBiometric,
  });
}

/**
 * O atalho da biometria deste aparelho, ligado e desligado pelo Perfil e pela
 * caixinha da Início.
 *
 * Ligar não é uma anotação: exige confirmar a biometria ali mesmo. Antes o
 * interruptor só gravava um booleano, e isso deixava ligar o atalho num
 * aparelho sem digital cadastrada, ou sem que o iOS jamais tivesse pedido a
 * permissão de Face ID — a promessa só falhava depois, na abertura, quando já
 * não dava para explicar nada. Pedir a confirmação aqui faz o próprio ato de
 * ligar provar que funciona, e é o momento natural para o iOS mostrar o pedido
 * de permissão (`NSFaceIDUsageDescription`).
 */
export function useBiometricSetting() {
  const enabled = useDevicePreferencesStore((state) => state.biometriaAtiva);
  const choiceMade = useDevicePreferencesStore((state) => state.biometricChoiceMade);
  const setEnabled = useDevicePreferencesStore((state) => state.setBiometriaAtiva);
  const authentication = useBiometricAuthentication();
  const { showToast } = useToast();

  async function enable() {
    if (authentication.isPending) return;

    const confirmed = await authentication.mutateAsync();

    if (!confirmed) {
      showToast('Não foi possível confirmar sua biometria. O atalho segue desligado.', {
        variant: 'error',
      });
      return;
    }

    setEnabled(true);
    showToast('Biometria ligada. Ela vale quando você reabrir o app sem ter saído.', {
      variant: 'success',
    });
  }

  return {
    enabled,
    /** Já ligou ou desligou alguma vez neste aparelho. */
    choiceMade,
    isPending: authentication.isPending,
    enable,
    /** Desliga — e, na caixinha da Início, registra o "agora não". */
    disable: () => setEnabled(false),
  };
}
