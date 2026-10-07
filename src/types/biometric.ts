// Tipos da biometria. Capacidade do APARELHO, não dado de paciente.

/**
 * Qual biometria o aparelho oferece, para a tela chamá-la pelo nome que a
 * pessoa conhece: Face ID e Touch ID no iPhone, digital ou rosto no Android.
 * `other`: íris, mais de uma cadastrada, ou um tipo que o plugin não distingue.
 */
export type BiometricKind = 'face-id' | 'touch-id' | 'fingerprint' | 'face' | 'other';
