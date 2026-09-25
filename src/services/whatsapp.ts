/**
 * Entrega o endereço `whatsapp://send?...` ao sistema, que abre o WhatsApp.
 *
 * Navegação do próprio WebView: o Capacitor repassa qualquer esquema que não
 * seja do app ao sistema operacional. Sem o WhatsApp instalado nada abre, e é
 * por isso que a tela de envio mantém "Enviar por SMS" sempre à vista — detectar
 * a ausência com segurança exigiria `@capacitor/app-launcher` (dependência nova,
 * a aprovar).
 */
export function openWhatsApp(url: string): void {
  window.location.assign(url);
}
