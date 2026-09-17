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

/** `initialize` é idempotente do lado do plugin, mas não é de graça. */
let inicializacao: Promise<void> | null = null;

function initializeSocialLogin(): Promise<void> {
  if (!inicializacao) {
    inicializacao = SocialLogin.initialize({
      google: {
        webClientId: GOOGLE_WEB_CLIENT_ID,
        iOSClientId: GOOGLE_IOS_CLIENT_ID,
        // 'online' é obrigatório para receber `idToken`. Em 'offline' o plugin
        // devolve só um `serverAuthCode`, que o Supabase não aceita.
        mode: 'online',
      },
      // A Apple não se configura aqui: o que ela precisa é a capability no App
      // ID e a entitlement no projeto, não parâmetro de runtime.
      apple: {},
    }).catch((erro: unknown) => {
      // Sem isto, uma falha de inicialização ficaria memorizada e toda tentativa
      // seguinte falharia de imediato, com a mesma causa já superada.
      inicializacao = null;
      throw erro;
    });
  }

  return inicializacao;
}

/**
 * Se o login federado nativo tem como funcionar neste build.
 *
 * Sem os client IDs o diálogo abriria e falharia no fim, depois de a pessoa já
 * ter escolhido a conta — pior do que o botão não aparecer.
 */
export function isNativeSocialLoginConfigured(): boolean {
  if (!Capacitor.isNativePlatform()) return false;
  return Boolean(GOOGLE_WEB_CLIENT_ID && GOOGLE_IOS_CLIENT_ID);
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
    options: { nonce: nonceDigest },
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

/**
 * Abre o diálogo nativo e troca o token por sessão do Supabase.
 *
 * @throws {Error} Cancelamento, falha do provedor ou recusa do Supabase.
 */
export async function signInWithNativeProvider(provider: OAuthProvider): Promise<{ fullName?: string }> {
  await initializeSocialLogin();

  const nonce = await createNoncePair();

  // O provedor recebe o DIGEST; o Supabase recebe o CRU, logo abaixo.
  const { idToken, fullName } =
    provider === 'google' ? await entrarComGoogle(nonce.digest) : await entrarComApple(nonce.digest);

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
