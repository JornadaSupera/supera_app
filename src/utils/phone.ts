import { unmask } from './masks';

/** Código do Brasil no formato internacional. */
const BRAZIL_COUNTRY_CODE = '55';

/**
 * A MESMA regra de `private.normalize_br_phone` no banco
 * (`20260925133537_add_phone_normalization.sql`): DDD de 11 a 99 sem nenhum
 * zero, nono dígito obrigatoriamente `9`, mais oito dígitos.
 *
 * Só celular, e isso é decisão do banco, não limitação: os dois usos são SMS e
 * WhatsApp, e telefone fixo não recebe nenhum dos dois.
 */
const BR_MOBILE = /^[1-9][1-9]9[0-9]{8}$/;

/**
 * É um celular brasileiro que o banco aceita?
 *
 * Existe para o formulário recusar o que o servidor recusaria — e recusar no
 * campo, e não num aviso geral depois de a chamada ir e voltar. Contar só os
 * 11 dígitos deixaria passar DDD com zero (`(10) …`) e o formato antigo sem o
 * nono dígito (`(49) 8xxxx-xxxx`), que o banco devolve como `invalid_phone`.
 */
export function isBrazilianMobile(phone: string): boolean {
  return BR_MOBILE.test(normalizeBrDigits(unmask(phone)));
}

/**
 * A MESMA normalização que `private.normalize_br_phone` faz ANTES de validar:
 * tira o `55` quando sobram 13 dígitos e o zero de discagem quando sobram 12.
 *
 * Sem isto, um número que o banco ACEITA (`+55 49 99999-1234` colado inteiro,
 * ou `0 49 99999-1234`) seria recusado no campo — o app ficaria mais rígido que
 * o servidor, que é o tipo de divergência que gera "o número está certo e o app
 * não aceita".
 *
 * O `55` só sai com 13 dígitos: com 11, `55` é o DDD de Santa Maria/RS, e
 * tirá-lo destruiria um número válido. É exatamente o que o banco faz.
 */
function normalizeBrDigits(digits: string): string {
  if (digits.length === 13 && digits.startsWith('55')) return digits.slice(2);
  if (digits.length === 12 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

/**
 * Celular no formato internacional (E.164), como o Auth e o envio de SMS o
 * usam: `(49) 99999-9999` vira `+5549999999999`.
 *
 * Recebe o valor do campo, com ou sem máscara. A validade é do schema — aqui
 * só se monta o formato.
 */
export function toInternationalPhone(phone: string): string {
  // Normaliza antes de prefixar, pela mesma razão de `isBrazilianMobile`: um
  // valor colado com o código do país viraria `+5555…` sem isto.
  return `+${BRAZIL_COUNTRY_CODE}${normalizeBrDigits(unmask(phone))}`;
}

/**
 * O inverso: `+5549999999999` vira os 11 dígitos nacionais, prontos para a
 * máscara do campo (`formatPhone`). Um valor que não começa com `+55` volta só
 * com os dígitos, sem cortar nada.
 */
export function fromInternationalPhone(phone: string): string {
  const digits = unmask(phone);
  return phone.trim().startsWith(`+${BRAZIL_COUNTRY_CODE}`) ? digits.slice(BRAZIL_COUNTRY_CODE.length) : digits;
}
