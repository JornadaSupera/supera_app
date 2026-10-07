import { Capacitor } from '@capacitor/core';
import { BiometryType, NativeBiometric } from '@capgo/capacitor-native-biometric';
import type { BiometricKind } from '../types';

// Em arquivo próprio, e não em `services/biometric.js`: aquele ainda é
// JavaScript (dívida conhecida), e código novo nasce em TypeScript.

/**
 * Qual biometria este aparelho tem, para a tela chamá-la pelo nome. `null` no
 * navegador e em aparelho sem biometria cadastrada — o mesmo critério de
 * `isBiometricAvailable`, que decide se o atalho existe.
 */
export async function getBiometricKind(): Promise<BiometricKind | null> {
  if (!Capacitor.isNativePlatform()) return null;

  try {
    const { isAvailable, biometryType } = await NativeBiometric.isAvailable();
    if (!isAvailable) return null;

    switch (biometryType) {
      case BiometryType.FACE_ID:
        return 'face-id';
      case BiometryType.TOUCH_ID:
        return 'touch-id';
      case BiometryType.FINGERPRINT:
        return 'fingerprint';
      case BiometryType.FACE_AUTHENTICATION:
        return 'face';
      default:
        return 'other';
    }
  } catch {
    return null;
  }
}
