import { unmask } from './masks';

/** Código do Brasil no formato internacional. */
const BRAZIL_COUNTRY_CODE = '55';

/**
 * Celular no formato internacional (E.164), como o Auth e o envio de SMS o
 * usam: `(49) 99999-9999` vira `+5549999999999`.
 *
 * Recebe o valor do campo, com ou sem máscara. A validade (11 dígitos) é do
 * schema — aqui só se monta o formato.
 */
export function toInternationalPhone(phone: string): string {
  return `+${BRAZIL_COUNTRY_CODE}${unmask(phone)}`;
}
