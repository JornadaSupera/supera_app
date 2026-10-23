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

/**
 * O WhatsApp da enfermagem, em E.164: é por ele que a clínica atende o
 * paciente desde 21/10 (o Chat do app abre a conversa com a mensagem pronta).
 * O mesmo número do telefone da enfermagem.
 */
export const NURSING_WHATSAPP_E164 = '+5549991999235';

export const CLINIC_PHONE: ClinicPhone = {
  label: 'Supera Oncologia',
  display: '(49) 3323-9836',
  href: 'tel:+554933239836',
};

/**
 * Suporte técnico do aplicativo (a equipe que desenvolveu o app), nos 3 meses
 * de suporte depois da entrega de 23/10/2026. Atende pelo WhatsApp: o toque
 * abre a conversa com a mensagem pronta, sem dado nenhum do paciente. Acabou o
 * período ou mudou o número? É só aqui.
 */
export const APP_SUPPORT = {
  label: 'Suporte do aplicativo',
  display: '(66) 99940-1499',
  whatsappE164: '+5566999401499',
  message: 'Olá! Estou entrando em contato pelo aplicativo Jornada Supera e gostaria de suporte técnico.',
} as const;

export const CLINIC_WEBSITE = {
  display: 'supera.med.br',
  url: 'https://supera.med.br',
} as const;
