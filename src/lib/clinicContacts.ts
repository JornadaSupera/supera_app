/**
 * Contatos da Supera Oncologia mostrados no app (Perfil, Central de
 * Conhecimento, Encarregado de Dados).
 *
 * Vêm do folheto da clínica ("Cuide bem do seu cateter", 25/09/2026). Não há
 * e-mail de contato publicado: o do Encarregado de Dados (DPO) ainda precisa
 * ser informado pela clínica e, até lá, o contato dele é o telefone da clínica.
 * Mudou um número? É só aqui.
 */

export interface ClinicPhone {
  /** Quem atende. */
  label: string;
  /** Como aparece na tela, no formato do app. */
  display: string;
  /** Endereço de discagem, com país e DDD. */
  href: string;
}

export const NURSING_PHONE: ClinicPhone = {
  label: 'Enfermagem',
  display: '(49) 99199-9235',
  href: 'tel:+5549991999235',
};

export const CLINIC_PHONE: ClinicPhone = {
  label: 'Supera Oncologia',
  display: '(49) 3323-9836',
  href: 'tel:+554933239836',
};

export const CLINIC_WEBSITE = {
  display: 'supera.med.br',
  url: 'https://supera.med.br',
} as const;
