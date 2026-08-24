import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

// Este app não guarda senha real (backend não existe, tudo é mock — ver
// CLAUDE.md), então usamos só verifyIdentity() como um "sim/não" de
// identidade. Não usamos getCredentials/setCredentials do plugin: essa
// API guarda usuário+senha reais no Keychain/Keystore pra autoload depois,
// o que não faz sentido aqui e adicionaria superfície de segurança que
// este projeto não precisa.

export async function isBiometricAvailable() {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    const { isAvailable } = await NativeBiometric.isAvailable();
    return isAvailable;
  } catch {
    return false;
  }
}

export async function authenticateWithBiometric() {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    await NativeBiometric.verifyIdentity({
      reason: 'Confirme sua identidade para entrar na Jornada Supera.',
      title: 'Entrar com biometria',
      subtitle: 'Face ID, Touch ID ou impressão digital',
      negativeButtonText: 'Cancelar',
    });
    return true;
  } catch {
    return false;
  }
}
