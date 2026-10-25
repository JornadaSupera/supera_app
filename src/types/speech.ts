// Ditado por voz: a pessoa fala, e o reconhecimento de fala do PRÓPRIO
// aparelho (ou do navegador) devolve o texto. Nenhum áudio passa pelo nosso
// banco nem pelas nossas funções: só o texto, e só quando a pessoa o envia.

/** Por que a escuta não começou ou terminou sem texto. */
export type SpeechErrorCode =
  /** O microfone foi negado agora ou está negado nas configurações. */
  | 'permission_denied'
  /** O aparelho (ou o navegador) não tem reconhecimento de fala. */
  | 'unavailable'
  /** Não ouviu fala nenhuma, ou não entendeu o que ouviu. */
  | 'no_speech'
  /** O reconhecimento precisa da internet e ela falhou. */
  | 'network'
  /** O microfone ou o reconhecedor está ocupado por outro app. */
  | 'busy'
  | 'unknown';

/** O que a sessão de escuta avisa a quem a abriu. */
export interface SpeechHandlers {
  /** O texto entendido até agora; cada chamada substitui a anterior. */
  onText: (text: string) => void;
  /**
   * A escuta terminou: a pessoa tocou em parar, ou o aparelho percebeu o
   * silêncio. O último texto chega por `onText` antes disto.
   */
  onEnd: () => void;
  /** Uma falha durante a escuta. `onEnd` vem logo depois. */
  onError: (code: SpeechErrorCode) => void;
}

/** Uma escuta em andamento. */
export interface SpeechSession {
  /**
   * Para de ouvir e fica com o texto. No Android e no navegador vem o texto
   * final; no iOS, o último entendido, depois de a fala assentar.
   */
  stop: () => Promise<void>;
  /** Para de ouvir e descarta: depois disto, nenhum aviso chega. */
  cancel: () => Promise<void>;
}

/** O estado do ditado na tela. */
export type VoiceInputStatus = 'idle' | 'starting' | 'listening' | 'stopping';

// ------------------------------------------------------------------ Web Speech API
// O mínimo da API do navegador que o app usa. O TypeScript não a traz no
// `lib.dom` (o Chrome e o Safari a expõem com o prefixo `webkit`).

export interface WebSpeechAlternative {
  transcript: string;
}

export interface WebSpeechResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: WebSpeechAlternative | undefined;
}

export interface WebSpeechResultList {
  readonly length: number;
  [index: number]: WebSpeechResult | undefined;
}

export interface WebSpeechResultEvent {
  readonly results: WebSpeechResultList;
}

export interface WebSpeechErrorEvent {
  /** `not-allowed`, `no-speech`, `network`, `audio-capture`, `aborted`… */
  readonly error: string;
}

export interface WebSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: WebSpeechResultEvent) => void) | null;
  onerror: ((event: WebSpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export type WebSpeechRecognitionConstructor = new () => WebSpeechRecognition;
