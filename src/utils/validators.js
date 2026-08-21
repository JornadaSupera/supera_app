// Utilitários puros de validação para campos de formulário
// (CPF, telefone, data de nascimento). Sem dependência de React.

import { unmask } from './masks';

/**
 * Valida um CPF (mascarado ou não) pelo algoritmo oficial de dígitos
 * verificadores (módulo 11). Rejeita CPFs com quantidade de dígitos
 * incorreta ou com todos os dígitos iguais (ex.: "111.111.111-11"),
 * que passariam no cálculo mas não são documentos válidos.
 */
export function isValidCPF(cpf) {
  const digits = unmask(cpf);

  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const numbers = digits.split('').map(Number);

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += numbers[i] * (10 - i);
  }
  let remainder = sum % 11;
  const firstCheckDigit = remainder < 2 ? 0 : 11 - remainder;
  if (firstCheckDigit !== numbers[9]) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += numbers[i] * (11 - i);
  }
  remainder = sum % 11;
  const secondCheckDigit = remainder < 2 ? 0 : 11 - remainder;
  if (secondCheckDigit !== numbers[10]) return false;

  return true;
}

/**
 * Valida um telefone celular brasileiro (mascarado ou não): deve conter
 * exatamente 11 dígitos (DDD + 9 dígitos do número).
 */
export function isValidPhone(phone) {
  return unmask(phone).length === 11;
}

/**
 * Valida uma data de nascimento no formato "yyyy-mm-dd" (formato nativo
 * de <input type="date">). Retorna true somente se a string representar
 * uma data real (rejeita ex.: 2024-02-30), não for uma data futura, e a
 * idade resultante estiver entre 0 e 120 anos.
 */
export function isValidBirthDate(dateString) {
  if (!dateString || typeof dateString !== 'string') return false;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(year, month - 1, day);
  const isRealDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  if (!isRealDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  if (date > today) return false;

  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age--;
  }

  return age >= 0 && age <= 120;
}
