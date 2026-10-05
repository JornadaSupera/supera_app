// O som do sino da tela surpresa do encerramento do tratamento.
//
// Sintetizado aqui mesmo (Web Audio), sem arquivo de áudio: as parciais de um
// sino de mão pequeno, com ataque curto e decaimento lento, em volume baixo e
// com os agudos abafados — um "dim" suave, não um alarme. Duas batidas, a
// segunda mais fraca, acompanhando o balanço do sino na tela.
//
// O celular pode bloquear som que não nasceu de um toque. Por isso
// `ringBell()` diz se tocou: quando não toca, a tela tenta de novo no primeiro
// toque da pessoa. O som segue o modo silencioso do aparelho.

interface BellPartial {
  /** Múltiplo da frequência base. */
  ratio: number;
  /** Volume relativo da parcial. */
  gain: number;
  /** Segundos até sumir. */
  decay: number;
}

/** Parciais de um sino pequeno: hum, fundamental, terça, quinta, oitava e brilhos. */
const PARTIALS: readonly BellPartial[] = [
  { ratio: 0.5, gain: 0.3, decay: 3.2 },
  { ratio: 1, gain: 1, decay: 2.8 },
  { ratio: 1.19, gain: 0.4, decay: 2 },
  { ratio: 1.5, gain: 0.25, decay: 1.6 },
  { ratio: 2, gain: 0.3, decay: 1.3 },
  { ratio: 2.74, gain: 0.1, decay: 0.8 },
  { ratio: 3.76, gain: 0.05, decay: 0.5 },
];

/** Mi da quinta oitava: claro sem ser estridente. */
const BASE_FREQUENCY_HZ = 659.25;

/**
 * As batidas: quando (s) e com que força. A segunda acompanha a volta do sino.
 * Somadas as parciais, o pico fica em cerca de 1/4 da escala: audível no
 * alto-falante do celular sem assustar.
 */
const STRIKES = [
  { at: 0.05, volume: 0.11 },
  { at: 1.3, volume: 0.07 },
] as const;

/** Acima disto, os agudos são abafados: o sino soa redondo. */
const LOWPASS_HZ = 3800;

/** Quanto esperar o áudio liberar antes de desistir até o próximo toque. */
const RESUME_TIMEOUT_MS = 400;

type AudioContextConstructor = typeof AudioContext;

let context: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (context) return context;

  const Constructor: AudioContextConstructor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  if (!Constructor) return null;

  context = new Constructor();
  return context;
}

function strike(audio: AudioContext, output: AudioNode, startAt: number, volume: number) {
  const master = audio.createGain();
  master.gain.value = volume;
  master.connect(output);

  for (const partial of PARTIALS) {
    const oscillator = audio.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = BASE_FREQUENCY_HZ * partial.ratio;

    const envelope = audio.createGain();
    envelope.gain.setValueAtTime(0, startAt);
    envelope.gain.linearRampToValueAtTime(partial.gain, startAt + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + partial.decay);

    oscillator.connect(envelope).connect(master);
    oscillator.start(startAt);
    oscillator.stop(startAt + partial.decay + 0.05);
  }
}

/**
 * Toca o sino. Devolve `false` quando o aparelho não liberou o som (sem toque
 * da pessoa ainda) ou não tem Web Audio — aí quem chama tenta no próximo toque.
 */
export async function ringBell(): Promise<boolean> {
  const audio = getAudioContext();
  if (!audio) return false;

  if (audio.state !== 'running') {
    // Sem permissão, o `resume()` fica pendente até um toque: não dá para
    // esperar por ele.
    await Promise.race([
      audio.resume().catch(() => undefined),
      new Promise((resolve) => window.setTimeout(resolve, RESUME_TIMEOUT_MS)),
    ]);
  }
  if (audio.state !== 'running') return false;

  const lowpass = audio.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = LOWPASS_HZ;
  lowpass.connect(audio.destination);

  const now = audio.currentTime;
  for (const { at, volume } of STRIKES) {
    strike(audio, lowpass, now + at, volume);
  }

  return true;
}
