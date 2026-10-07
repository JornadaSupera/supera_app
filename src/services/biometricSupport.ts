import { Capacitor } from '@capacitor/core';
import { BiometryType, NativeBiometric } from '@capgo/capacitor-native-biometric';
import type { BiometricKind, BiometricSupport } from '../types';

// Em arquivo próprio, e não em `services/biometric.js`: aquele ainda é
// JavaScript (dívida conhecida), e código novo nasce em TypeScript.

function toBiometricKind(type: BiometryType): BiometricKind | null {
  switch (type) {
    case BiometryType.FACE_ID:
      return 'face-id';
    case BiometryType.TOUCH_ID:
      return 'touch-id';
    case BiometryType.FINGERPRINT:
      return 'fingerprint';
    case BiometryType.FACE_AUTHENTICATION:
      return 'face';
    case BiometryType.NONE:
      return null;
    default:
      return 'other';
  }
}

/**
 * A biometria deste aparelho: se dá para ligar o atalho (o mesmo critério de
 * `isBiometricAvailable`) e qual é, para a tela chamá-la pelo nome. `null` no
 * navegador, onde não existe. Sem rosto ou digital cadastrado, `available` é
 * falso, mas a opção continua existindo: a tela explica como cadastrar.
 */
export async function getBiometricSupport(): Promise<BiometricSupport | null> {
  if (!Capacitor.isNativePlatform()) return null;

  try {
    const { isAvailable, biometryType } = await NativeBiometric.isAvailable();
    return { available: isAvailable, kind: toBiometricKind(biometryType) };
  } catch {
    return { available: false, kind: null };
  }
}
