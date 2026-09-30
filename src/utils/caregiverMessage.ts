/**
 * A mensagem que o paciente envia ao acompanhante com os dados de acesso.
 *
 * Tom de serviço de saúde: sem emoji, sem exclamação, direto. Marca "Jornada
 * Supera", sem o nome da clínica, da especialidade nem de quem enviou — a
 * prévia da mensagem aparece na tela bloqueada do celular de quem recebe, e
 * nada ali pode revelar que existe um tratamento (decisão de 23/09, a mesma do
 * SMS que o servidor manda).
 *
 * As linhas de download só entram quando os endereços existem: até a
 * publicação nas lojas não há o que apontar, e um marcador vazio na mensagem
 * seria pior que a ausência.
 */

export interface CaregiverMessageInput {
  /**
   * `created` na criação do acesso; `reset` numa nova senha. Muda a frase de
   * abertura: dizer "você foi cadastrado" a quem já tinha acesso confunde.
   */
  reason: 'created' | 'reset';
  fullName: string;
  /** O e-mail que é o login. */
  login: string;
  temporaryPassword: string;
  /** ISO 8601. Até quando a senha provisória vale. */
  expiresAt: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
}

/** Primeiro nome, para a saudação: "Carlos Ribeiro" → "Carlos". */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? '';
}

/**
 * A validade em horário de Brasília, como o SMS do servidor a escreve
 * (`brDateTime` em `supabase/functions/_shared/common.ts`): as duas mensagens
 * dizem a mesma hora, e a de quem recebe não depende do fuso do aparelho de
 * quem envia.
 */
function formatExpiry(iso: string): string | null {
  const date = new Date(iso);
  // Data ilegível não pode derrubar a mensagem: ela é o único lugar em que a
  // senha provisória existe. Sem a data, a frase fala nas 72 horas.
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(date)
    .replace(',', ' às');
}

export function buildCaregiverAccessMessage({
  reason,
  fullName,
  login,
  temporaryPassword,
  expiresAt,
  appStoreUrl = '',
  playStoreUrl = '',
}: CaregiverMessageInput): string {
  const name = firstName(fullName);
  const until = formatExpiry(expiresAt);
  const validity = until ? `A senha provisória vale até ${until}.` : 'A senha provisória vale por 72 horas.';
  const nextStep =
    reason === 'created'
      ? 'No primeiro acesso, você criará uma senha pessoal.'
      : 'No próximo acesso, você criará uma nova senha pessoal.';

  const lines = [
    name ? `Olá, ${name}.` : 'Olá.',
    '',
    reason === 'created'
      ? 'Você foi cadastrado(a) como acompanhante no aplicativo Jornada Supera.'
      : 'Uma nova senha provisória foi gerada para o seu acesso de acompanhante no aplicativo Jornada Supera.',
    '',
    `Login: ${login}`,
    `Senha provisória: ${temporaryPassword}`,
    '',
    `${validity} ${nextStep}`,
  ];

  if (appStoreUrl || playStoreUrl) {
    lines.push('', 'Baixe o aplicativo:');
    if (playStoreUrl) lines.push(`Android: ${playStoreUrl}`);
    if (appStoreUrl) lines.push(`iPhone: ${appStoreUrl}`);
  }

  return lines.join('\n');
}

/** Só os dígitos do E.164, que é o formato que o WhatsApp espera: `+5549999991234` → `5549999991234`. */
function whatsAppNumber(phoneE164: string): string {
  return phoneE164.replace(/\D/g, '');
}

/**
 * NO CELULAR: `whatsapp://send`, que o sistema entrega direto ao aplicativo
 * instalado — já na conversa do número e com o texto pronto. Nada passa por
 * página web.
 */
export function buildWhatsAppAppUrl(phoneE164: string, text: string): string {
  return `whatsapp://send?phone=${whatsAppNumber(phoneE164)}&text=${encodeURIComponent(text)}`;
}

/**
 * NO COMPUTADOR: o WhatsApp Web, direto na conversa (decisão de 28/09: "na web,
 * o de web mesmo"). O texto vai na URL — e, com ele, a senha provisória fica no
 * histórico daquele navegador.
 */
export function buildWhatsAppWebUrl(phoneE164: string, text: string): string {
  return `https://web.whatsapp.com/send?phone=${whatsAppNumber(phoneE164)}&text=${encodeURIComponent(text)}`;
}
