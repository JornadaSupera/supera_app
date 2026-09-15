import { useMutation, useQuery } from '@tanstack/react-query';
import { authenticateWithBiometric, isBiometricAvailable } from '../services/biometric';

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
 * Pede a confirmação biométrica nativa. Devolve `false` — não lança — se
 * recusada, cancelada pelo usuário ou indisponível; ver `services/biometric.js`.
 */
export function useBiometricAuthentication() {
  return useMutation({
    mutationFn: authenticateWithBiometric,
  });
}
