import type { BiometricKind } from '../types';

/** Os textos da biometria deste aparelho, no Perfil, no login e na Início. */
export interface BiometricText {
  /** O rótulo do interruptor ("Abrir o app com o Face ID"). */
  switchLabel: string;
  /** A pergunta da caixinha da Início. */
  offerTitle: string;
  offerDescription: string;
}

/** Como o aparelho chama a biometria e com o que a pessoa confirma que é ela. */
const NAME_BY_KIND: Record<BiometricKind, { name: string; how: string }> = {
  'face-id': { name: 'o Face ID', how: 'com o seu rosto' },
  'touch-id': { name: 'o Touch ID', how: 'com a sua digital' },
  fingerprint: { name: 'a sua digital', how: 'com a sua digital' },
  face: { name: 'o seu rosto', how: 'com o seu rosto' },
  other: { name: 'a biometria', how: 'com a sua biometria' },
};

/**
 * Os textos para a biometria deste aparelho: Face ID no iPhone, digital no
 * Android — o nome que a pessoa vê nos ajustes do próprio celular. Sem o tipo,
 * "biometria".
 */
export function getBiometricText(kind: BiometricKind | null): BiometricText {
  const { name, how } = NAME_BY_KIND[kind ?? 'other'];

  return {
    switchLabel: `Abrir o app com ${name}`,
    offerTitle: `Usar ${name} para abrir o app?`,
    offerDescription: `Nas próximas vezes, o app abre ${how}. Você pode mudar isso no Perfil.`,
  };
}

/** Rosto (Face ID ou reconhecimento facial) ou digital: escolhe o ícone. */
export function isFaceBiometric(kind: BiometricKind | null): boolean {
  return kind === 'face-id' || kind === 'face';
}
