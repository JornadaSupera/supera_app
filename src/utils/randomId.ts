// Identificador aleatório — hoje, o nome do arquivo de uma imagem do chat.
//
// `crypto.randomUUID` só existe em contexto seguro, e a WebView do iOS
// (`capacitor://localhost`) nem sempre conta como um (ver `utils/nonce.ts`).
// `getRandomValues` não tem essa exigência: é dele que sai o UUID quando o
// atalho não existe.

/** UUID v4, no formato `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`. */
export function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versão 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
