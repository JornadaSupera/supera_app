import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  describeSpeechError,
  isSpeechInputAvailable,
  readSpeechErrorCode,
  startSpeechSession,
} from '../services/speechRecognition';
import type { SpeechErrorCode, SpeechSession, VoiceInputStatus } from '../types';

// Ditado por voz. Capacidade do APARELHO, não dado de paciente: o texto ditado
// vai direto para o campo (memória do formulário) e só sai dali se a pessoa
// enviar a pergunta.

/** Uma pergunta falada cabe folgada aqui; passou disso, a escuta para sozinha. */
export const VOICE_MAX_SECONDS = 90;

/** Quanto esperar o texto final depois do "Terminei" antes de desistir dele. */
const STOP_GRACE_MS = 4000;

/** Se o aparelho (ou o navegador) sabe ditar. Não muda com o app aberto. */
export function useSpeechInputSupport() {
  return useQuery({
    queryKey: ['speech-input-support'],
    queryFn: isSpeechInputAvailable,
    staleTime: Infinity,
  });
}

interface UseVoiceInputOptions {
  /** O texto entendido até agora nesta escuta; cada chamada substitui a anterior. */
  onText: (text: string) => void;
}

/**
 * Liga o microfone, acompanha o tempo e traduz as falhas.
 *
 * Cada escuta tem um número (`attemptRef`): o que chega de uma escuta que já
 * foi cancelada ou trocada é ignorado, porque o aparelho ainda pode mandar um
 * último texto depois de a pessoa desistir.
 */
export function useVoiceInput({ onText }: UseVoiceInputOptions) {
  const support = useSpeechInputSupport();
  const [status, setStatusState] = useState<VoiceInputStatus>('idle');
  const [errorCode, setErrorCode] = useState<SpeechErrorCode | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const statusRef = useRef<VoiceInputStatus>('idle');
  const sessionRef = useRef<SpeechSession | null>(null);
  const attemptRef = useRef(0);
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  });

  const setStatus = useCallback((next: VoiceInputStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const start = useCallback(async () => {
    if (statusRef.current !== 'idle') return;

    const attempt = ++attemptRef.current;
    const isCurrent = () => attemptRef.current === attempt;
    let ended = false;
    let heard = false;

    setErrorCode(null);
    setElapsedSeconds(0);
    setStatus('starting');

    try {
      const session = await startSpeechSession({
        onText: (text) => {
          if (!isCurrent()) return;
          if (text) heard = true;
          onTextRef.current(text);
        },
        onError: (code) => {
          if (!isCurrent()) return;
          // Parte da fala já entrou no campo: o "não entendi" do fim não é falha.
          if (code === 'no_speech' && heard) return;
          setErrorCode(code);
        },
        onEnd: () => {
          ended = true;
          if (!isCurrent()) return;
          sessionRef.current = null;
          setStatus('idle');
        },
      });

      // Cancelada (ou a tela saiu) enquanto o microfone abria.
      if (!isCurrent()) {
        void session.cancel();
        return;
      }
      if (ended) return;

      sessionRef.current = session;
      setStatus('listening');
    } catch (error) {
      if (!isCurrent()) return;
      setErrorCode(readSpeechErrorCode(error));
      setStatus('idle');
    }
  }, [setStatus]);

  /** Para de ouvir e fica com o texto. */
  const stop = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || statusRef.current !== 'listening') return;

    const attempt = attemptRef.current;
    setStatus('stopping');

    // O texto final chega e a escuta termina sozinha (`onEnd`). Se o aparelho
    // não avisar, a tela não pode ficar presa em "Terminando…".
    window.setTimeout(() => {
      if (attemptRef.current !== attempt || sessionRef.current !== session) return;
      attemptRef.current++;
      sessionRef.current = null;
      setStatus('idle');
      void session.cancel();
    }, STOP_GRACE_MS);

    await session.stop();
  }, [setStatus]);

  /** Para de ouvir e esquece esta escuta. Quem usa desfaz o texto ditado. */
  const cancel = useCallback(async () => {
    attemptRef.current++;
    const session = sessionRef.current;
    sessionRef.current = null;
    setErrorCode(null);
    setStatus('idle');
    await session?.cancel();
  }, [setStatus]);

  const clearError = useCallback(() => setErrorCode(null), []);

  // O relógio da escuta, e o teto: passou dele, para como se a pessoa tivesse
  // tocado em "Terminei".
  useEffect(() => {
    if (status !== 'listening') return;

    const timer = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status === 'listening' && elapsedSeconds >= VOICE_MAX_SECONDS) void stop();
  }, [status, elapsedSeconds, stop]);

  // O app foi para o fundo (outra tela do celular, tela apagada): fica com o
  // que já foi dito, em vez de deixar o microfone aberto.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') void stop();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [stop]);

  // Saiu da tela: fecha o microfone.
  useEffect(
    () => () => {
      attemptRef.current++;
      void sessionRef.current?.cancel();
      sessionRef.current = null;
    },
    []
  );

  return {
    /** `true` só quando o aparelho confirmou que sabe ditar. */
    supported: support.data === true,
    status,
    elapsedSeconds,
    errorMessage: errorCode ? describeSpeechError(errorCode) : null,
    start,
    stop,
    cancel,
    clearError,
  };
}
