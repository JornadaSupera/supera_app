import type { BiometricKind } from '../types';

/**
 * Os textos da biometria no Perfil, no login e na Início. Sempre "biometria
 * (Face ID / Touch ID)", em qualquer aparelho (pedido de 07/10: "não é só
 * digital"): o nome do tipo vale para o rosto e para a digital, e é o que a
 * pessoa reconhece. O tipo do aparelho só escolhe o ícone.
 */
export const BIOMETRIC_TEXT = {
  /** O rótulo do interruptor. */
  switchLabel: 'Entrar com biometria (Face ID / Touch ID)',
  /** O rótulo do interruptor no login, que vale para a próxima abertura (pedido de 07/10). */
  loginSwitchLabel: 'Entrar com biometria (Face ID / Touch ID) na próxima sessão',
  /** A pergunta do diálogo da Início. */
  offerTitle: 'Usar a biometria (Face ID / Touch ID) para entrar?',
  offerDescription: 'Nas próximas vezes, o app abre com o seu rosto ou a sua digital. Você pode mudar isso no Perfil.',
  /** No aparelho sem nada cadastrado, no lugar da nota do interruptor. */
  notEnrolledHint: 'Para usar, cadastre a biometria (Face ID / Touch ID) nos ajustes do celular.',
} as const;

/** Rosto (Face ID ou reconhecimento facial) ou digital: escolhe o ícone. */
export function isFaceBiometric(kind: BiometricKind | null): boolean {
  return kind === 'face-id' || kind === 'face';
}
