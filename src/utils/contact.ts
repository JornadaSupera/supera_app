/**
 * Mascaramento de contato para exibição.
 *
 * E-mail e telefone são dado pessoal: a regra do projeto é mostrá-los
 * mascarados por padrão, revelando só sob ação explícita do titular. Estas
 * funções são de apresentação — nunca use o retorno delas para comparar,
 * enviar ou gravar, só para renderizar.
 */

/** `maria.silva@gmail.com` → `ma••••••@gmail.com` */
export function maskEmail(value: string): string {
  const email = value.trim();
  const at = email.lastIndexOf('@');

  // Sem `@` não dá para separar local de domínio; trata como texto genérico.
  if (at < 1) return maskGeneric(email);

  const local = email.slice(0, at);
  const domain = email.slice(at);
  // Um local muito curto não tem o que preservar sem entregar o endereço.
  const visiveis = local.length <= 2 ? 1 : 2;

  return `${local.slice(0, visiveis)}${'•'.repeat(Math.max(local.length - visiveis, 2))}${domain}`;
}

/** `(49) 99123-4567` → `(49) •••••-4567` */
export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 6) return maskGeneric(value);

  const ddd = digits.slice(0, 2);
  const fim = digits.slice(-4);
  const ocultos = Math.max(digits.length - 6, 1);

  return `(${ddd}) ${'•'.repeat(ocultos)}-${fim}`;
}

/**
 * Mascara pelo canal do convite. `p_channel` do banco é `'sms'` ou `'email'`,
 * e é ele que diz como o destino deve ser lido.
 *
 * O canal é anulável no domínio (um vínculo pode existir sem convite
 * associado), então o formato é inferido do próprio valor nesse caso — nunca
 * exposto cru.
 */
export function maskContact(
  canal: 'sms' | 'email' | null | undefined,
  value: string | null | undefined
): string {
  if (!value) return '';
  if (canal === 'email') return maskEmail(value);
  if (canal === 'sms') return maskPhone(value);
  return value.includes('@') ? maskEmail(value) : maskPhone(value);
}

function maskGeneric(value: string): string {
  if (value.length <= 2) return '•'.repeat(Math.max(value.length, 2));
  return `${value.slice(0, 2)}${'•'.repeat(Math.max(value.length - 2, 2))}`;
}
