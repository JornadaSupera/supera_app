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

export interface AppSupportContact {
  label: string;
  /** Como aparece na tela, no formato do app. */
  display: string;
  /** O WhatsApp, em E.164. */
  whatsappE164: string;
  /** A mensagem pronta, sem dado nenhum do paciente. */
  message: string;
}

/** A equipe que desenvolveu o app, nos 3 meses de suporte depois da entrega de 23/10/2026. */
const DEVELOPER_SUPPORT = { display: '(66) 99940-1499', whatsappE164: '+5566999401499' } as const;

/** O suporte da própria Supera, que assume quando o período acaba. */
const SUPERA_SUPPORT = { display: '(49) 98419-6504', whatsappE164: '+5549984196504' } as const;

/** O primeiro dia do suporte da Supera (o dos desenvolvedores vale até 23/01/2027), à meia-noite local. */
const SUPERA_SUPPORT_FROM = new Date(2027, 0, 24);

/**
 * Suporte técnico do aplicativo, pelo WhatsApp: o toque abre a conversa com a
 * mensagem pronta. O número troca sozinho no fim do período de suporte, sem
 * versão nova do app. Mudou um número ou a data? É só aqui.
 */
export function getAppSupport(now: Date = new Date()): AppSupportContact {
  return {
    label: 'Suporte do aplicativo',
    message: 'Olá! Estou entrando em contato pelo aplicativo Jornada Supera e gostaria de suporte técnico.',
    ...(now < SUPERA_SUPPORT_FROM ? DEVELOPER_SUPPORT : SUPERA_SUPPORT),
  };
}

export const CLINIC_WEBSITE = {
  display: 'supera.med.br',
  url: 'https://supera.med.br',
} as const;
