// Nonce do login federado.
//
// Existe para impedir replay: o provedor assina o nonce dentro do id_token, e o
// Supabase confere se bate com o que a tela diz ter mandado. Um token roubado
// não serve para outra tentativa.
//
// A parte que engana: SÃO DUAS FORMAS DO MESMO VALOR. O provedor recebe o
// DIGEST (SHA-256 em hexadecimal) e o Supabase recebe o valor CRU. A
// documentação do Supabase é literal — "you need to provide a hashed version to
// Google and a non-hashed version to signInWithIdToken". Inverter os dois faz o
// GoTrue recusar o token com um erro que não menciona nonce, e a depuração vai
// parar no lugar errado.
//
// Nenhum dos plugins de login faz esse hash sozinho: eles repassam ao provedor
// exatamente a string que receberem. Por isso o hash é aqui.

/** Bytes aleatórios em hexadecimal — o valor que o Supabase vai conferir. */
export function generateRawNonce(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * SHA-256 em hexadecimal — o valor que vai para o provedor.
 *
 * `crypto.subtle` só existe em contexto seguro. No iOS a WebView roda sob
 * `capacitor://localhost`, e há relato de que esse esquema nem sempre conta
 * como seguro; por isso a ausência é tratada como erro explícito em vez de
 * `undefined` silencioso, que viraria um nonce vazio indo para o provedor.
 */
export async function hashNonce(rawNonce: string): Promise<string> {
  if (!crypto?.subtle) {
    throw new Error('Este aparelho não permite concluir o login com segurança. Use e-mail e senha.');
  }

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawNonce));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Par pronto para uso: `digest` vai ao provedor, `raw` vai ao Supabase. */
export async function createNoncePair(): Promise<{ raw: string; digest: string }> {
  const raw = generateRawNonce();
  return { raw, digest: await hashNonce(raw) };
}
