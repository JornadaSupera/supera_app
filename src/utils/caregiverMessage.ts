/**
 * A mensagem que o paciente envia ao acompanhante com os dados de acesso.
 *
 * O texto foi decidido em 23/09 (marca "Jornada Supera", sem o nome da clínica
 * nem da especialidade: o SMS aparece na tela bloqueada). O e-mail e a senha
 * provisória vão no corpo porque é assim que o acompanhante entra pela
 * primeira vez; a senha vale 72 horas e a troca é obrigatória no primeiro
 * acesso.
 *
 * As linhas de download só entram quando os endereços existem: até a
 * publicação nas lojas não há o que apontar, e um marcador vazio na mensagem
 * seria pior que a ausência.
 */

export interface CaregiverMessageInput {
  fullName: string;
  email: string;
  temporaryPassword: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
}

/** Primeiro nome, para a saudação: "Carlos Ribeiro" → "Carlos". */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? '';
}

export function buildCaregiverAccessMessage({
  fullName,
  email,
  temporaryPassword,
  appStoreUrl = '',
  playStoreUrl = '',
}: CaregiverMessageInput): string {
  const lines = [
    `Olá, *${firstName(fullName)}*! 👋 Você foi cadastrado como acompanhante no Jornada Supera.`,
    '',
    'Seus dados de acesso:',
    `📧 E-mail: ${email}`,
    `🔑 Senha temporária: ${temporaryPassword}`,
  ];

  if (appStoreUrl || playStoreUrl) {
    lines.push('', 'Baixe o aplicativo:');
    if (appStoreUrl) lines.push(`🍎 iOS: ${appStoreUrl}`);
    if (playStoreUrl) lines.push(`🤖 Android: ${playStoreUrl}`);
  }

  lines.push('', 'No seu primeiro acesso será obrigatório criar uma nova senha.', 'Equipe Jornada Supera.');

  return lines.join('\n');
}

/**
 * Endereço que abre o WhatsApp já com a conversa e o texto prontos.
 *
 * `whatsapp://send`, e não `wa.me`: o `wa.me` passa pelo navegador, que guarda
 * o endereço — e a senha provisória iria junto para o histórico dele. O esquema
 * próprio entrega direto ao aplicativo.
 */
export function buildWhatsAppUrl(phoneE164: string, text: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  return `whatsapp://send?phone=${digits}&text=${encodeURIComponent(text)}`;
}
