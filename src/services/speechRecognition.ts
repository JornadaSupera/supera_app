import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { AppError } from '../lib/appError';
import type {
  SpeechErrorCode,
  SpeechHandlers,
  SpeechSession,
  WebSpeechRecognitionConstructor,
} from '../types';

// Ditado por voz (pergunta à IA). Quem ouve e transcreve é o reconhecimento de
// fala do próprio aparelho — no app, o do Android ou do iOS, pelo plugin
// `@capgo/capacitor-speech-recognition`; no navegador, a Web Speech API, onde
// existir. O áudio nunca passa pelo nosso banco nem pelas nossas funções: o
// app só recebe o texto, e o texto só segue para a IA quando a pessoa o envia.
//
// No iPhone, quando ele reconhece português sem internet, o app pede esse
// modo, e o áudio nem sai do celular. No Android vale o reconhecedor padrão do
// aparelho (o mesmo do ditado do teclado).

const LANGUAGE = 'pt-BR';

/** As frases de cada falha, para a tela não precisar conhecer os códigos. */
const SPEECH_ERROR_MESSAGES: Record<SpeechErrorCode, string> = {
  permission_denied: 'Para falar a pergunta, permita o uso do microfone nas configurações do aparelho.',
  unavailable: 'O reconhecimento de voz deste aparelho não está disponível em português. Digite a sua pergunta.',
  no_speech: 'Não ouvimos a sua pergunta. Toque no microfone e fale de novo.',
  network: 'Não foi possível entender a voz agora. Confira a internet ou digite a pergunta.',
  busy: 'O microfone está em uso por outro app. Tente de novo em instantes.',
  unknown: 'Não foi possível usar o microfone agora. Digite a sua pergunta.',
};

export function describeSpeechError(code: SpeechErrorCode): string {
  return SPEECH_ERROR_MESSAGES[code];
}

function speechError(code: SpeechErrorCode, cause?: unknown): AppError {
  return new AppError(SPEECH_ERROR_MESSAGES[code], code, cause);
}

/** O código de uma falha que já veio como `AppError` do ditado, ou `unknown`. */
export function readSpeechErrorCode(error: unknown): SpeechErrorCode {
  if (error instanceof AppError && error.code in SPEECH_ERROR_MESSAGES) {
    return error.code as SpeechErrorCode;
  }
  return 'unknown';
}

// ------------------------------------------------------------------ navegador

function webRecognitionConstructor(): WebSpeechRecognitionConstructor | null {
  const scope = window as Window & {
    SpeechRecognition?: WebSpeechRecognitionConstructor;
    webkitSpeechRecognition?: WebSpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

function webErrorCode(error: string): SpeechErrorCode {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission_denied';
    case 'no-speech':
      return 'no_speech';
    case 'network':
      return 'network';
    case 'audio-capture':
      return 'busy';
    case 'language-not-supported':
      return 'unavailable';
    default:
      return 'unknown';
  }
}

function startWebSession(handlers: SpeechHandlers): SpeechSession {
  const Recognition = webRecognitionConstructor();
  if (!Recognition) throw speechError('unavailable');

  const recognition = new Recognition();
  recognition.lang = LANGUAGE;
  // Contínuo: a pessoa fala no ritmo dela e toca em "Terminei"; o navegador
  // não encerra na primeira pausa.
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let cancelled = false;
  let ended = false;

  recognition.onresult = (event) => {
    if (cancelled) return;
    // A lista traz a fala inteira desde o começo: as frases já fechadas e a
    // que ainda está sendo entendida.
    const parts: string[] = [];
    for (let index = 0; index < event.results.length; index++) {
      const transcript = event.results[index]?.[0]?.transcript.trim();
      if (transcript) parts.push(transcript);
    }
    handlers.onText(parts.join(' '));
  };

  recognition.onerror = (event) => {
    // `aborted` é o próprio cancelamento.
    if (cancelled || event.error === 'aborted') return;
    handlers.onError(webErrorCode(event.error));
  };

  recognition.onend = () => {
    if (ended) return;
    ended = true;
    if (!cancelled) handlers.onEnd();
  };

  // Pede o microfone ao navegador na primeira vez; a recusa chega por
  // `onerror` (`not-allowed`).
  try {
    recognition.start();
  } catch (error) {
    throw speechError('busy', error);
  }

  return {
    stop: async () => {
      if (!ended) recognition.stop();
    },
    cancel: async () => {
      cancelled = true;
      if (!ended) recognition.abort();
    },
  };
}

// ------------------------------------------------------------------ aparelho (Capacitor)

/**
 * Os códigos do plugin: os do `SpeechRecognizer` do Android (`NO_MATCH`…) e os
 * do iOS (`MICROPHONE_PERMISSION_DENIED`, ou `DOMINIO_número` do erro nativo —
 * `KAFASSISTANTERRORDOMAIN_1110` é "nenhuma fala").
 */
function nativeErrorCode(code: string | undefined): SpeechErrorCode {
  switch (code) {
    case 'INSUFFICIENT_PERMISSIONS':
    case 'MICROPHONE_PERMISSION_DENIED':
      return 'permission_denied';
    case 'NO_MATCH':
    case 'SPEECH_TIMEOUT':
      return 'no_speech';
    case 'NETWORK':
    case 'NETWORK_TIMEOUT':
    case 'SERVER':
    case 'SERVER_DISCONNECTED':
      return 'network';
    case 'RECOGNIZER_BUSY':
    case 'AUDIO':
    case 'AUDIO_SESSION_FAILED':
    case 'AUDIO_ENGINE_START_FAILED':
      return 'busy';
    // `UNKNOWN_12` e `UNKNOWN_13` são os erros 12 e 13 do Android (idioma não
    // suportado / indisponível), que o plugin não nomeia: o reconhecedor
    // padrão do aparelho não tem o português — comum quando o padrão é o do
    // "Android System Intelligence", só com os idiomas baixados.
    case 'RECOGNIZER_UNAVAILABLE':
    case 'UNSUPPORTED_LOCALE':
    case 'UNKNOWN_12':
    case 'UNKNOWN_13':
      return 'unavailable';
    default:
      return code?.endsWith('_1110') ? 'no_speech' : 'unknown';
  }
}

/** A recusa do `start()` vem só com a frase do plugin (em inglês). */
function nativeStartErrorCode(error: unknown): SpeechErrorCode {
  const message = error instanceof Error ? error.message : '';
  if (/permission|denied/i.test(message)) return 'permission_denied';
  if (/already running/i.test(message)) return 'busy';
  return 'unavailable';
}

/** Pede o microfone (e, no iOS, o reconhecimento de fala) quando ainda não foi dado. */
async function ensureNativePermission(): Promise<void> {
  try {
    let { speechRecognition } = await SpeechRecognition.checkPermissions();
    if (speechRecognition !== 'granted') {
      ({ speechRecognition } = await SpeechRecognition.requestPermissions());
    }
    if (speechRecognition !== 'granted') throw speechError('permission_denied');
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw speechError('unknown', error);
  }
}

/**
 * Se o reconhecedor do aparelho atende o português. O iOS confere o idioma
 * pedido (sem ele, usaria o do aparelho — um iPhone em inglês com região
 * Brasil diria que não); o TypeScript do plugin não declara a opção, que o
 * código nativo lê. O Android ignora o idioma aqui.
 */
function nativeAvailable(): Promise<{ available: boolean }> {
  const plugin = SpeechRecognition as unknown as {
    available: (options: { language: string }) => Promise<{ available: boolean }>;
  };
  return plugin.available({ language: LANGUAGE });
}

/**
 * A escuta anterior ainda fechando no aparelho. No Android, cancelar só
 * termina de verdade até ~1,5 s depois; abrir outra antes disso seria recusado
 * ("already running") e receberia os avisos atrasados da antiga. A próxima
 * escuta espera esta promessa.
 */
let nativeTeardown: Promise<void> = Promise.resolve();

/** Teto da espera pelo fim da escuta cancelada, se o aparelho não avisar. */
const NATIVE_TEARDOWN_TIMEOUT_MS = 2500;

/**
 * No iOS, o `stop()` do plugin descarta o que o reconhecedor ainda não
 * devolveu: antes dele, espera o texto parar de mudar (a fala "assentar"),
 * até este teto — dentro da espera do "Terminando…" do hook.
 */
const IOS_SETTLE_MAX_MS = 1500;
const IOS_SETTLE_QUIET_MS = 700;

async function startNativeSession(handlers: SpeechHandlers): Promise<SpeechSession> {
  await nativeTeardown;

  const { available } = await nativeAvailable().catch(() => ({ available: false }));
  if (!available) throw speechError('unavailable');

  await ensureNativePermission();

  let ended = false;
  let cancelled = false;
  // Os avisos de estado chegam com o número da escuta: o primeiro depois do
  // `start()` diz qual é a nossa, e os de outra são ignorados.
  let startRequested = false;
  let ownSessionId: number | undefined;
  let lastTextAt = 0;
  let resolveTeardown: (() => void) | null = null;
  const listeners: PluginListenerHandle[] = [];

  const removeListeners = async () => {
    await Promise.all(listeners.splice(0).map((listener) => listener.remove()));
  };

  const isOwnSession = (sessionId: number | undefined) =>
    ownSessionId === undefined || sessionId === undefined || sessionId === ownSessionId;

  const finish = () => {
    if (ended) return;
    ended = true;
    void removeListeners();
    if (!cancelled) handlers.onEnd();
  };

  listeners.push(
    await SpeechRecognition.addListener('partialResults', (event) => {
      if (ended || cancelled) return;
      // `accumulatedText` só vem quando o reconhecimento foi reiniciado no
      // meio da fala; no caso comum, o texto é o primeiro palpite.
      const text = event.accumulatedText ?? event.matches?.[0];
      if (text === undefined) return;
      lastTextAt = Date.now();
      handlers.onText(text.trim());
    }),
    await SpeechRecognition.addListener('error', (event) => {
      if (ended || cancelled || !isOwnSession(event.sessionId)) return;
      handlers.onError(nativeErrorCode(event.code));
    }),
    await SpeechRecognition.addListener('listeningState', (event) => {
      if (!startRequested) return;
      if (ownSessionId === undefined) ownSessionId = event.sessionId;
      if (!isOwnSession(event.sessionId)) return;
      if (event.state !== 'stopped' && event.status !== 'stopped') return;

      resolveTeardown?.();
      finish();
    })
  );

  // `preferLegacyRecognizer`: no iOS 26 o caminho novo pode abrir e fechar a
  // escuta sem mandar texto nenhum; o antigo também ouve sem internet.
  const options = {
    language: LANGUAGE,
    partialResults: true,
    popup: false,
    maxResults: 1,
    addPunctuation: true,
    preferLegacyRecognizer: true,
  };

  // O modo sem internet só no iOS. No Android, a consulta do plugin cria o
  // reconhecedor fora da linha principal e o sistema fecha o app (Android 13+).
  const onDevice =
    Capacitor.getPlatform() === 'ios' &&
    (await SpeechRecognition.isOnDeviceRecognitionAvailable({ language: LANGUAGE, preferLegacyRecognizer: true })
      .then((result) => result.available)
      .catch(() => false));

  startRequested = true;
  try {
    try {
      await SpeechRecognition.start({ ...options, useOnDeviceRecognition: onDevice });
    } catch (error) {
      // Sem o modo offline (modelo de idioma não baixado, por exemplo), tenta
      // o reconhecimento comum antes de desistir.
      if (!onDevice) throw error;
      ownSessionId = undefined;
      await SpeechRecognition.start(options);
    }
  } catch (error) {
    ended = true;
    await removeListeners();
    throw speechError(nativeStartErrorCode(error), error);
  }

  const waitForTextToSettle = async () => {
    const deadline = Date.now() + IOS_SETTLE_MAX_MS;
    while (!ended && Date.now() < deadline && Date.now() - lastTextAt < IOS_SETTLE_QUIET_MS) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
  };

  return {
    stop: async () => {
      if (ended) return;
      if (Capacitor.getPlatform() === 'ios') await waitForTextToSettle();
      if (ended) return;
      // Sem escuta em andamento o plugin recusa; aí a sessão já acabou.
      await SpeechRecognition.stop().catch(finish);
    },
    cancel: async () => {
      if (ended) return;
      cancelled = true;
      ended = true;
      // Os ouvintes ficam até o aparelho dizer que fechou: é por eles que a
      // próxima escuta sabe que pode começar.
      nativeTeardown = new Promise<void>((resolve) => {
        resolveTeardown = resolve;
        window.setTimeout(resolve, NATIVE_TEARDOWN_TIMEOUT_MS);
      });
      void nativeTeardown.then(removeListeners);
      await SpeechRecognition.forceStop().catch(() => undefined);
    },
  };
}

// ------------------------------------------------------------------ entrada

/**
 * Se dá para ditar aqui. No app, a resposta final é do próprio reconhecedor
 * (aparelho sem o serviço de voz do Google, por exemplo, responde `false`);
 * no navegador, basta a API existir.
 */
export async function isSpeechInputAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return webRecognitionConstructor() !== null;

  try {
    const { available } = await nativeAvailable();
    return available;
  } catch {
    return false;
  }
}

/**
 * Começa a ouvir. Pede o microfone na primeira vez.
 * @throws {AppError} com o `code` de `SpeechErrorCode` quando não dá para ouvir.
 */
export async function startSpeechSession(handlers: SpeechHandlers): Promise<SpeechSession> {
  return Capacitor.isNativePlatform() ? startNativeSession(handlers) : startWebSession(handlers);
}
