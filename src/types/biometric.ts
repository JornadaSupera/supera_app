// Tipos da biometria. Capacidade do APARELHO, não dado de paciente.

/**
 * Qual biometria o aparelho oferece, para a tela chamá-la pelo nome que a
 * pessoa conhece: Face ID e Touch ID no iPhone, digital ou rosto no Android.
 * `other`: íris, mais de uma cadastrada, ou um tipo que o plugin não distingue.
 */
export type BiometricKind = 'face-id' | 'touch-id' | 'fingerprint' | 'face' | 'other';

/** A biometria deste aparelho, no app nativo (no navegador não há nenhuma). */
export interface BiometricSupport {
  /** Há rosto ou digital cadastrado: o atalho pode ser ligado. */
  available: boolean;
  /** O tipo, quando o aparelho diz — mesmo sem cadastro, para nomear a opção. */
  kind: BiometricKind | null;
}
