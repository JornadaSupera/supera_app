import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { requireSupabase } from './supabaseClient';
import { createNoncePair } from '../utils/nonce';
import type { OAuthProvider } from '../types';

// Login federado NO APARELHO, pelo SDK nativo de cada provedor.
//
// POR QUE NÃO É O MESMO CAMINHO DA WEB. Na web, `signInWithOAuth` manda a
// pessoa ao provedor e o retorno volta por `redirectTo`. Numa WebView Capacitor
// isso não funciona: `window.location.origin` é `https://localhost` (Android) ou
// `capacitor://localhost` (iOS), nenhum dos dois é destino web válido, e o
// GoTrue — sem recusar nem avisar — devolve o `Site URL` do projeto, que aqui é
// o painel clínico. O paciente terminava numa tela que não é dele.
//
// Aqui não existe redirect nenhum: o SDK nativo abre o diálogo do sistema DENTRO
// do app, devolve um `id_token` assinado, e esse token vira sessão por
// `signInWithIdToken`. Nada de Site URL, nada de allow-list, nada de deep link.
//
// O Google, aliás, PROÍBE o fluxo por WebView embutida ("must not direct a
// Google OAuth 2.0 authorization request to an embedded user-agent") — o SDK
// nativo não é WebView embutida, é o caminho suportado.

/**
 * Client IDs. Não são segredo — client ID de OAuth é público por natureza e vai
 * no pacote do app de qualquer jeito. Ficam em `VITE_*` por serem configuração
 * de ambiente (Regra nº 3), não valor cravado: homologação e produção podem
 * apontar para projetos diferentes.
 *
 * O ANDROID NÃO TEM CLIENT ID AQUI, e isso confunde: o Credential Manager exige
 * o client ID **Web**. O client Android existe só para autorizar o APK pelo
 * package name + SHA-1, e nunca aparece em código.
 */
const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID;

/**
 * Se o Google nativo tem client ID para ESTA plataforma.
 *
 * Cada plataforma usa só o próprio valor — o Android manda `webClientId` ao
 * Credential Manager, o iOS manda `iOSClientId` ao GIDSignIn. Checar os dois
 * juntos (como esta função já fez no passado) faz o Android ficar refém de uma
 * variável que só o iOS usa, e vice-versa.
 */
export function isGoogleSignInConfigured(): boolean {
  if (!Capacitor.isNativePlatform()) return false;
  return Capacitor.getPlatform() === 'ios' ? Boolean(GOOGLE_IOS_CLIENT_ID) : Boolean(GOOGLE_WEB_CLIENT_ID);
}

/**
 * Se a Apple nativa tem como funcionar neste aparelho.
 *
 * Só existe diálogo nativo de verdade no iOS. O Android deste plugin não tem
 * folha do sistema para a Apple: ou sai por uma Custom Tab (fora do app, que a
 * cliente recusou) ou depende de um servidor de callback próprio, que este
 * projeto não tem. Não oferecer aqui é melhor que oferecer o que não funciona.
 * Diferente do Google, não depende de client ID nenhum — só de capability e
 * entitlement no projeto iOS.
 */
export function isAppleSignInConfigured(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

/** Se ESTE provedor tem como funcionar nativamente neste aparelho. */
export function isProviderNativelyConfigured(provider: OAuthProvider): boolean {
  return provider === 'google' ? isGoogleSignInConfigured() : isAppleSignInConfigured();
}

/** `initialize` é idempotente do lado do plugin, mas não é de graça. */
let inicializacao: Promise<void> | null = null;

function initializeSocialLogin(): Promise<void> {
  if (!inicializacao) {
    inicializacao = SocialLogin.initialize({
      // Só entra quando ESTA plataforma tem o client ID dela. Mandar a chave
      // com valor `undefined` reage diferente por plataforma — no Android
      // rejeita a inicialização inteira, no iOS é ignorada em silêncio — e
      // nenhum dos dois é o que se quer: omitir de propósito.
      ...(isGoogleSignInConfigured() && {
        google: {
          webClientId: GOOGLE_WEB_CLIENT_ID,
          iOSClientId: GOOGLE_IOS_CLIENT_ID,
          // Sem isto o id_token do iOS sai com a audience do client iOS, e o
          // painel do Supabase (Client IDs do Google) tem de listar os dois.
          // Mandar aqui não muda o que o Supabase exige, só deixa explícito
          // que os dois valores existem por design, não por descuido.
          iOSServerClientId: GOOGLE_WEB_CLIENT_ID,
          // 'online' é obrigatório para receber `idToken`. Em 'offline' o plugin
          // devolve só um `serverAuthCode`, que o Supabase não aceita.
          mode: 'online',
        },
      }),
      // Só no iOS. A Apple não se configura por parâmetro (o que ela precisa é
      // a capability no App ID e a entitlement no projeto) — mas no ANDROID
      // mandar esta chave, mesmo vazia, derruba a inicialização inteira: o
      // plugin exige `apple.clientId` ali e recusa antes de olhar para o
      // bloco do Google. `isAppleSignInConfigured()` já é `getPlatform() ===
      // 'ios'`, então isto é só reaproveitar a mesma checagem.
      ...(isAppleSignInConfigured() && { apple: {} }),
    }).catch((erro: unknown) => {
      // Sem isto, uma falha de inicialização ficaria memorizada e toda tentativa
      // seguinte falharia de imediato, com a mesma causa já superada.
      inicializacao = null;
      throw erro;
    });
  }

  return inicializacao;
}

interface TokenDoProvedor {
  idToken: string | null;
  /** Só a Apple manda, e só na PRIMEIRA autorização. Ver `RequireAccountName`. */
  fullName?: string;
}

function juntarNome(...partes: (string | null | undefined)[]): string | undefined {
  const nome = partes.filter((p): p is string => Boolean(p?.trim())).join(' ').trim();
  return nome || undefined;
}

async function entrarComGoogle(nonceDigest: string): Promise<TokenDoProvedor> {
  const { result } = await SocialLogin.login({
    provider: 'google',
    options: {
      nonce: nonceDigest,
      // Sem isto, o SEGUNDO login com Google no mesmo aparelho iOS devolve a
      // sessão em cache (`restorePreviousSignIn`), com o nonce da tentativa
      // anterior — e o Supabase recusa por nonce, mesmo a pessoa tendo acabado
      // de confirmar a conta. No Android e na Web a opção não existe e o
      // plugin a ignora, então é seguro mandar sempre.
      forcePrompt: true,
    },
  });

  // `offline` não traz `idToken` — só aconteceria se o `mode` acima mudasse.
  // Checar aqui é o que impede a mudança de virar um erro sem explicação.
  if (result.responseType === 'offline') {
    throw new Error('Configuração de login inválida neste app. Fale com a recepção do Centro.');
  }

  return {
    idToken: result.idToken,
    fullName: juntarNome(result.profile.name) ?? juntarNome(result.profile.givenName, result.profile.familyName),
  };
}

async function entrarComApple(nonceDigest: string): Promise<TokenDoProvedor> {
  const { result } = await SocialLogin.login({
    provider: 'apple',
    options: { scopes: ['email', 'name'], nonce: nonceDigest },
  });

  return {
    idToken: result.idToken,
    fullName: juntarNome(result.profile.givenName, result.profile.familyName),
  };
}

/** Código que o plugin usa em `error.code` quando a pessoa fecha o diálogo por conta própria. */
export const USER_CANCELLED_CODE = 'USER_CANCELLED';

/** Se o erro é a pessoa tendo cancelado o diálogo — nunca é falha, nunca vira toast. */
export function isUserCancelledError(erro: unknown): boolean {
  return Boolean(erro) && typeof erro === 'object' && (erro as { code?: unknown }).code === USER_CANCELLED_CODE;
}

function marcarComoCancelado(erro: Error): Error {
  (erro as Error & { code?: string }).code = USER_CANCELLED_CODE;
  return erro;
}

/**
 * Abre o diálogo nativo e troca o token por sessão do Supabase.
 *
 * @throws {Error} Cancelamento (`code === USER_CANCELLED_CODE`), falha do
 * provedor ou recusa do Supabase.
 */
export async function signInWithNativeProvider(provider: OAuthProvider): Promise<{ fullName?: string }> {
  if (!isProviderNativelyConfigured(provider)) {
    // Não deveria ser alcançável: o botão some quando isto é falso (ver
    // `Login.tsx`). Fica como rede de segurança — nunca cair no redirect da
    // web a partir daqui, que é exatamente o que a pessoa não quer.
    throw new Error('Este login não está disponível neste aparelho.');
  }

  await initializeSocialLogin();

  const nonce = await createNoncePair();

  let idToken: string | null;
  let fullName: string | undefined;

  try {
    // O provedor recebe o DIGEST; o Supabase recebe o CRU, logo abaixo.
    const token = provider === 'google' ? await entrarComGoogle(nonce.digest) : await entrarComApple(nonce.digest);
    idToken = token.idToken;
    fullName = token.fullName;
  } catch (erro) {
    // `USER_CANCELLED` é contrato do plugin (ver `errors.ts` dele): a pessoa
    // fechou o diálogo por conta própria, e isso nunca deveria virar toast de
    // erro. Qualquer outro erro do SDK nativo sai cru demais para a tela do
    // paciente (mensagem de diagnóstico em inglês, às vezes com package name e
    // SHA-1) — por isso a tradução genérica no `else`.
    if (isUserCancelledError(erro)) {
      throw marcarComoCancelado(new Error('Login cancelado.'));
    }
    throw new Error('Não foi possível abrir o login. Tente novamente ou use seu e-mail e senha.');
  }

  if (!idToken) {
    throw new Error('O provedor não devolveu um token de identidade. Tente novamente.');
  }

  const client = requireSupabase();

  const { error } = await client.auth.signInWithIdToken({
    provider,
    token: idToken,
    nonce: nonce.raw,
  });

  if (error) throw new Error(traduzirErroDeToken(error.message));

  return { fullName };
}

function traduzirErroDeToken(mensagem: string): string {
  const texto = mensagem.toLowerCase();

  // Caso PERMANENTE: o provedor não devolveu claim de nonce nenhuma (erro de
  // configuração de alguma plataforma). Distinto do caso abaixo, que é
  // repetível — aqui pedir para tentar de novo só frustra, porque vai falhar
  // sempre até alguém corrigir a configuração.
  if (texto.includes('should either both exist or not')) {
    return 'Este login ainda não está liberado para o aplicativo. Fale com a recepção do Centro.';
  }

  if (texto.includes('nonce')) {
    // O provedor devolveu um token em cache, de antes deste nonce. A saída é
    // repetir o login — não conferir credencial.
    return 'A confirmação expirou. Toque no botão e entre de novo.';
  }

  if (texto.includes('audience') || texto.includes('client')) {
    // Client ID fora da lista do provider no Supabase: é configuração, não erro
    // de quem está entrando.
    return 'Este login ainda não está liberado para o aplicativo. Fale com a recepção do Centro.';
  }

  return 'Não foi possível concluir o login. Tente novamente ou use seu e-mail e senha.';
}
