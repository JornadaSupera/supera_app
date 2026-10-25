import { useEffect, useId, useRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Mic, SendHorizontal, Sparkles, Square, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import Button from '../../components/ui/button';
import Textarea from '../../components/ui/textarea';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { formatStopwatch } from '../../utils/date';
import type { AssistantQuestionFormValues } from '../../schemas/contentAssistant';
import type { VoiceInputStatus } from '../../types';

interface AssistantComposerProps {
  form: UseFormReturn<AssistantQuestionFormValues>;
  maxChars: number;
  /** Uma pergunta ainda está sendo respondida: a próxima espera por ela. */
  busy: boolean;
  onSubmit: () => void;
  /** Foca o campo ao abrir (vindo de "Fazer outra pergunta"). */
  autoFocus?: boolean;
}

/** A fala entra depois do que já estava escrito, e a frase começa em maiúscula. */
function joinDictation(written: string, spoken: string, maxChars: number): string {
  const text = written ? `${written} ${spoken}` : spoken.charAt(0).toUpperCase() + spoken.slice(1);
  return text.slice(0, maxChars);
}

/** O que o leitor de tela ouve a cada passo do ditado. */
const VOICE_ANNOUNCEMENTS: Record<VoiceInputStatus, string> = {
  idle: '',
  starting: '',
  listening: 'Ouvindo. Fale a sua pergunta e toque em Terminei.',
  stopping: 'Terminando…',
};

/** O foco ainda está num botão que sumiu (o navegador o devolve ao `body`). */
function focusWasLost(): boolean {
  return document.activeElement === null || document.activeElement === document.body;
}

/**
 * O campo da pergunta, com as duas formas de perguntar à vista: digitar ou
 * tocar no microfone e falar. O ditado escreve no próprio campo, ao vivo, e a
 * pessoa confere o texto antes de tocar em "Perguntar" — nada é enviado
 * sozinho.
 *
 * O microfone só aparece onde o aparelho (ou o navegador) sabe ditar; onde não
 * sabe, a tela fica só com o texto, sem botão que não funciona.
 */
export default function AssistantComposer({ form, maxChars, busy, onSubmit, autoFocus = false }: AssistantComposerProps) {
  const questionId = useId();
  const introId = useId();
  const hintId = useId();
  const counterId = useId();
  const errorId = useId();
  const voiceErrorId = useId();

  const {
    register,
    watch,
    getValues,
    setValue,
    setFocus,
    formState: { errors, isSubmitted },
  } = form;

  const question = watch('question') ?? '';

  // O que estava escrito quando o microfone abriu: o ditado entra depois
  // dele, e cancelar volta exatamente a ele.
  const writtenRef = useRef('');
  const micRef = useRef<HTMLButtonElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const previousStatusRef = useRef<VoiceInputStatus>('idle');

  const voice = useVoiceInput({
    onText: (spoken) => {
      setValue('question', joinDictation(writtenRef.current, spoken, maxChars), {
        shouldDirty: true,
        shouldValidate: isSubmitted,
      });
    },
  });

  const voiceActive = voice.status !== 'idle';
  const listening = voice.status === 'listening' || voice.status === 'stopping';

  useEffect(() => {
    if (autoFocus) setFocus('question');
  }, [autoFocus, setFocus]);

  // A barra troca de botões ao ouvir e ao parar: quem usa teclado ou leitor
  // de tela segue para o botão que apareceu, em vez de cair no começo da
  // página. O campo não recebe o foco — no celular, isso abriria o teclado.
  useEffect(() => {
    const previous = previousStatusRef.current;
    previousStatusRef.current = voice.status;

    if (voice.status === 'listening' && previous !== 'listening' && focusWasLost()) {
      stopRef.current?.focus();
    }
    if (voice.status === 'idle' && (previous === 'listening' || previous === 'stopping') && focusWasLost()) {
      micRef.current?.focus();
    }
  }, [voice.status]);

  function startDictation() {
    writtenRef.current = getValues('question').trimEnd();
    void voice.start();
  }

  function cancelDictation() {
    void voice.cancel();
    setValue('question', writtenRef.current, { shouldDirty: true, shouldValidate: isSubmitted });
  }

  const describedBy = [introId, hintId, counterId, errors.question ? errorId : null, voice.errorMessage ? voiceErrorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <form className="flex flex-col gap-3" noValidate onSubmit={onSubmit}>
      {/* Os espaços vêm do `gap`: o reset global do `index.css` zera a margem do
          `p`. O texto fica na cor de leitura (e não na apagada): é ele que diz
          como perguntar. */}
      <div className="flex flex-col gap-1">
        <label htmlFor={questionId} className="flex items-center gap-2 text-card-title font-bold text-primary-deep">
          <Sparkles size={22} strokeWidth={2} className="shrink-0" aria-hidden="true" />
          O que você quer saber?
        </label>
        <p id={introId} className="text-body-sm text-foreground">
          {voice.supported ? 'Digite sua pergunta ou toque no microfone para falar.' : 'Digite sua pergunta.'} A IA
          procura nas orientações da sua equipe e mostra onde ler.
        </p>
      </div>

      {/* A caixa é uma só: o campo em cima e a barra de ações embaixo. O foco
          aparece na caixa inteira (o anel laranja do app), e não só no campo. */}
      <div
        className={cn(
          'flex flex-col rounded-2xl border border-input bg-card shadow-sm transition-[border-color] duration-150 ease-[ease] focus-within:border-primary-deep has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-ring',
          errors.question && 'border-destructive focus-within:border-destructive',
          listening && 'border-primary-deep'
        )}
      >
        <Textarea
          id={questionId}
          // `outline-none!`: o anel de foco global (`:focus-visible`, fora de
          // camada no `index.css`) venceria o utilitário comum; ele já aparece
          // na caixa inteira.
          className="min-h-[128px] rounded-2xl border-0 bg-transparent px-4 pt-4 pb-2 focus:border-0 focus-visible:outline-none!"
          maxLength={maxChars}
          placeholder={listening ? 'Pode falar…' : 'Ex.: o que posso comer durante a quimioterapia?'}
          readOnly={voiceActive}
          aria-describedby={describedBy}
          aria-invalid={errors.question ? true : undefined}
          {...register('question', { onChange: voice.clearError })}
        />

        {/* Sempre na página: uma região de aviso que nasce já com o texto
            costuma não ser lida. */}
        <span role="status" className="sr-only">
          {VOICE_ANNOUNCEMENTS[voice.status]}
        </span>

        {/* Botões de 48 px que não encolhem: em 320–375 px de largura, quem cede
            é o rótulo — abaixo de 375 px ficam só o ponto vermelho e o relógio. */}
        <div className="flex min-h-14 items-center gap-2 px-2 pb-2">
          {listening ? (
            <>
              <span aria-hidden="true" className="flex min-w-0 items-center gap-2 pl-2 text-label font-semibold text-primary-deep">
                <span className="relative flex size-3 shrink-0">
                  <span className="absolute inline-flex size-full rounded-full bg-destructive opacity-60 motion-safe:animate-ping" />
                  <span className="relative inline-flex size-3 rounded-full bg-destructive" />
                </span>
                <span className="min-w-0 truncate max-[374px]:hidden">
                  {voice.status === 'stopping' ? 'Terminando…' : 'Ouvindo…'}
                </span>
                <span className="shrink-0 font-medium text-muted-foreground tabular-nums">
                  {formatStopwatch(voice.elapsedSeconds)}
                </span>
              </span>
              <Button
                variant="ghost"
                pill
                iconLeft={X}
                className="ml-auto shrink-0"
                aria-label="Cancelar e apagar o que foi falado"
                disabled={voice.status === 'stopping'}
                onClick={cancelDictation}
              />
              <Button
                ref={stopRef}
                size="sm"
                pill
                iconLeft={Square}
                className="shrink-0"
                loading={voice.status === 'stopping'}
                aria-label={voice.status === 'stopping' ? 'Terminando o ditado' : undefined}
                onClick={() => void voice.stop()}
              >
                Terminei
              </Button>
            </>
          ) : (
            <>
              {voice.supported && (
                <Button
                  ref={micRef}
                  variant="soft"
                  pill
                  iconLeft={Mic}
                  className="shrink-0"
                  aria-label="Falar a pergunta"
                  loading={voice.status === 'starting'}
                  onClick={startDictation}
                />
              )}
              <span
                id={counterId}
                className="ml-auto min-w-0 truncate px-1 text-caption font-medium text-muted-foreground tabular-nums"
              >
                <span className="sr-only">Caracteres: </span>
                {question.length}/{maxChars}
              </span>
              <Button
                type="submit"
                size="sm"
                pill
                iconLeft={SendHorizontal}
                className="shrink-0"
                loading={busy}
                aria-label={busy ? 'Aguardando a resposta da pergunta anterior' : undefined}
                disabled={voiceActive}
              >
                Perguntar
              </Button>
            </>
          )}
        </div>
      </div>

      {voice.errorMessage && (
        <p id={voiceErrorId} role="alert" className="text-caption font-medium text-destructive">
          {voice.errorMessage}
        </p>
      )}
      {errors.question && (
        <p id={errorId} role="alert" className="text-caption font-medium text-destructive">
          {errors.question.message}
        </p>
      )}
      <p id={hintId} className="text-caption font-medium text-foreground">
        Não escreva nem fale nome, CPF ou telefone. Para sintomas ou urgência, fale com a equipe pelo chat.
      </p>
    </form>
  );
}
