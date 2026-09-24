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

  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-[color-mix(in_srgb,var(--color-muted)_50%,transparent)] p-3">
      <div>
        <p className="text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
          ÚLTIMOS {SUMMARY_DAYS} DIAS
        </p>

        {isLoading ? (
          <Skeleton className="mt-1.5 h-4 w-56" />
        ) : total === undefined ? (
          // Sem o número, nada de "0 registros": não saber não é zero.
          <p className="mt-0.5 text-[14px] font-medium text-muted-foreground">
            Não foi possível contar seus registros agora.
          </p>
        ) : (
          <p className="mt-0.5 text-[14px] font-medium text-foreground">
            {total} {total === 1 ? 'registro' : 'registros'} · você está atento ao seu corpo 💙
          </p>
        )}
      </div>
    </div>
  );
}
