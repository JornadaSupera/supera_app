/**
 * Missão, visão e valores da Supera Oncologia, para a tela "Sobre a Supera".
 *
 * São os textos das paredes da clínica, enviados no pacote de design aprovado
 * em 03/10/2026 — palavra por palavra, sem reescrever. Mudou um texto na
 * clínica? É só aqui.
 */

export const CLINIC_MISSION =
  'Prestar assistência oncológica de forma humanizada, com excelência e de forma integral.';

export const CLINIC_VISION =
  'Tornar-se um dos principais centros de referência em Oncologia de Santa Catarina.';

export interface ClinicValue {
  /** A letra do acróstico: as seis, de cima para baixo, formam SUPERA. */
  letter: string;
  label: string;
}

export const CLINIC_VALUES: readonly ClinicValue[] = [
  { letter: 'S', label: 'Segurança' },
  { letter: 'U', label: 'União' },
  { letter: 'P', label: 'Perfeição' },
  { letter: 'E', label: 'Empatia' },
  { letter: 'R', label: 'Respeito' },
  { letter: 'A', label: 'Amor' },
];

export interface MottoPart {
  text: string;
  /** Trecho em negrito, como no modelo da clínica. */
  strong?: boolean;
}

/** "O otimismo é uma força capaz de mudar qualquer realidade!" */
export const CLINIC_MOTTO: readonly MottoPart[] = [
  { text: 'O ' },
  { text: 'otimismo', strong: true },
  { text: ' é uma força capaz de mudar qualquer ' },
  { text: 'realidade!', strong: true },
];
