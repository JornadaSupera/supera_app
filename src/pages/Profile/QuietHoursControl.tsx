import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import Switch from '../../components/ui/switch';
import Input from '../../components/ui/input';
import Loading from '../../components/ui/loading';
import InlineError from '../../components/ui/inline-error';
import { useQuietHours, useSetQuietHours } from '../../hooks/useNotifications';
import type { QuietHours } from '../../types';

const DEFAULT_START = '22:00';
const DEFAULT_END = '07:00';

/** Espera esta pausa depois da última digitação antes de gravar — evita uma escrita por tecla. */
const SAVE_DEBOUNCE_MS = 600;

/**
 * Atrasa o envio de notificações silenciáveis nesse período — nunca cancela
 * (README §5.8). Fica ligada/desligada como os outros toggles da seção; ligar
 * grava um horário padrão que a pessoa ajusta em seguida, desligar zera os
 * dois campos (`setQuietHours(null, null)`).
 */
export default function QuietHoursControl() {
  const { data: quietHours, isLoading, isError, refetch } = useQuietHours();
  const setQuietHoursMutation = useSetQuietHours();

  // Rascunho local do que o paciente está ajustando — sem ele, cada tecla no
  // horário disparava a mutation na hora, e respostas fora de ordem podiam
  // deixar a tela mostrando um horário diferente do que foi salvo por último.
  const [draft, setDraft] = useState<QuietHours | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (isLoading) {
    return <Loading inline />;
  }

  // Sem o valor salvo, a tela mostraria "desligada", e ligar gravaria 22:00–07:00
  // por cima do horário que a pessoa escolheu. Na falha, nada de interruptor.
  if (isError) {
    return (
      <InlineError
        title="Não foi possível carregar a janela de silêncio"
        onRetry={() => void refetch()}
      />
    );
  }

  function save(next: QuietHours) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setDraft(next);
    setQuietHoursMutation.mutate(next, {
      // Só larga o rascunho quando a gravação assenta (sucesso OU erro): em
      // erro, `quietHours` da query continua com o valor antigo, e soltar o
      // rascunho antes faria o campo "voltar" visivelmente no mesmo instante
      // do toast de erro — melhor deixar o valor digitado até aí.
      onSettled: () => setDraft(null),
    });
  }

  function scheduleSave(next: QuietHours) {
    setDraft(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      save(next);
    }, SAVE_DEBOUNCE_MS);
  }

  // `draft` é o valor em edição (mesmo com campos `null`, é diferente de "sem
  // rascunho") — por isso o `?:` inteiro, não um `??` campo a campo, que faria
  // "desligar" cair de volta no horário salvo antes de a mutation terminar.
  const effectiveStart = draft ? draft.start : (quietHours?.start ?? null);
  const effectiveEnd = draft ? draft.end : (quietHours?.end ?? null);
  const isActive = Boolean(effectiveStart && effectiveEnd);
  const start = effectiveStart ?? DEFAULT_START;
  const end = effectiveEnd ?? DEFAULT_END;
  const isSaving = setQuietHoursMutation.isPending;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5">
      <Switch
        id="janela-silencio"
        checked={isActive}
        disabled={isSaving}
        onChange={(turnOn) =>
          save(turnOn ? { start: DEFAULT_START, end: DEFAULT_END } : { start: null, end: null })
        }
        label={
          <span className="inline-flex items-center gap-2">
            <Clock size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            Janela de silêncio
          </span>
        }
      />
      {isActive && (
        <div className="flex items-center gap-2 pl-[26px]">
          <Input
            type="time"
            aria-label="Início da janela de silêncio"
            value={start}
            disabled={isSaving}
            onChange={(event) => scheduleSave({ start: event.target.value, end })}
            className="w-auto"
          />
          <span className="text-[13px] text-muted-foreground">até</span>
          <Input
            type="time"
            aria-label="Fim da janela de silêncio"
            value={end}
            disabled={isSaving}
            onChange={(event) => scheduleSave({ start, end: event.target.value })}
            className="w-auto"
          />
        </div>
      )}
      <p className="pl-[26px] text-[11px] leading-[1.4] text-muted-foreground">
        Notificações silenciáveis atrasam o envio nesse período — nunca são canceladas.
      </p>
    </div>
  );
}
