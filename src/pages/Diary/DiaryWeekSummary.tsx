import Skeleton from '../../components/ui/skeleton';
import { useRecentDiaryEntriesCount } from '../../hooks/useDiary';

/** Janela do resumo do topo, em dias. */
const SUMMARY_DAYS = 7;

/**
 * "Últimos 7 dias" do cabeçalho da timeline.
 *
 * A contagem é uma consulta própria, sem os filtros da lista: o cabeçalho
 * fala da semana do paciente, e não do que os chips deixaram na tela. Contar
 * em cima da lista carregada também deixou de servir quando ela passou a vir
 * em páginas.
 */
export default function DiaryWeekSummary() {
  const { data: total, isLoading } = useRecentDiaryEntriesCount(SUMMARY_DAYS);

  // Bloco discreto do guia (`surface-alt`), sem borda e sem emoji — o guia
  // não usa emoji nas telas clínicas. O espaço entre as linhas vem do `gap`:
  // o reset global do `index.css` zera a margem do `p`.
  return (
    <div className="mt-4 flex flex-col gap-0.5 rounded-lg bg-muted p-4">
      <p className="text-caption font-medium text-muted-foreground">
        Últimos {SUMMARY_DAYS} dias
      </p>

      {isLoading ? (
        // A linha do `text-body-sm` (21 px).
        <Skeleton className="h-[21px] w-56" />
      ) : total === undefined ? (
        // Sem o número, nada de "0 registros": não saber não é zero.
        <p className="text-body-sm font-semibold text-muted-foreground">
          Não foi possível contar seus registros agora.
        </p>
      ) : (
        // Zero sem elogio ("você está atento" com 0 registros se desmentia) e
        // sem gênero: a frase vale para qualquer paciente.
        <p className="text-body-sm font-semibold text-foreground">
          {total === 0
            ? 'Nenhum registro'
            : `${total} ${total === 1 ? 'registro' : 'registros'} · cuidando de você`}
        </p>
      )}
    </div>
  );
}
