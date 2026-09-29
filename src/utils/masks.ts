// Máscaras de exibição de CPF e celular, e a remoção delas. Puras, sem React.

/** Só os dígitos de um valor qualquer (`null`/`undefined` viram texto vazio). */
export function unmask(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

/** `12345678901` → `123.456.789-01`, montado aos poucos enquanto se digita. */
export function formatCPF(value: string | null | undefined): string {
  const digits = unmask(value).slice(0, 11);
  if (digits.length > 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length > 6) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  if (digits.length > 3) {
    return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  }
  return digits;
}

/** `49999998888` → `(49) 99999-8888` (e `(49) 9999-8888` com 10 dígitos). */
export function formatPhone(value: string | null | undefined): string {
  const digits = unmask(value).slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;

  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);

  if (digits.length <= 6) {
    return `(${ddd}) ${rest}`;
  }
  if (digits.length <= 10) {
    return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}
