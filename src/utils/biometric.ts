import type { BiometricKind } from '../types';

/** O texto da caixinha da Início que oferece a biometria. */
export interface BiometricOfferText {
  /** A pergunta, com o nome que o aparelho usa (Face ID, Touch ID, digital). */
  title: string;
  description: string;
}

/** Com o que a pessoa confirma que é ela, em cada tipo de biometria. */
const OFFER_BY_KIND: Record<BiometricKind, { name: string; how: string }> = {
  'face-id': { name: 'o Face ID', how: 'com o seu rosto' },
  'touch-id': { name: 'o Touch ID', how: 'com a sua digital' },
  fingerprint: { name: 'a sua digital', how: 'com a sua digital' },
  face: { name: 'o seu rosto', how: 'com o seu rosto' },
  other: { name: 'a biometria', how: 'com a sua biometria' },
};

/**
 * O texto da caixinha para a biometria deste aparelho: Face ID no iPhone,
 * digital no Android — o nome que a pessoa vê nos ajustes do próprio celular.
 */
export function getBiometricOfferText(kind: BiometricKind): BiometricOfferText {
  const { name, how } = OFFER_BY_KIND[kind];

  return {
    title: `Usar ${name} para abrir o app?`,
    description: `Nas próximas vezes, o app abre ${how}. Você pode mudar isso no Perfil.`,
  };
}
