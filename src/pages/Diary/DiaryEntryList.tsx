import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import Button from '../../components/ui/button';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import InlineError from '../../components/ui/inline-error';
import DiaryEntryCard from './DiaryEntryCard';
import { EntriesSkeleton } from './DiarySkeletons';
import type { useDiaryEntries } from '../../hooks/useDiary';
import { cn } from '../../lib/utils';
import { formatMonthGroupLabel } from '../../utils/date';
import type { EnrichedDiaryEntry } from '../../types';

interface EntryGroup {
  label: string;
  entries: EnrichedDiaryEntry[];
}

/** Agrupa por mês, na ordem em que os registros chegam (do mais recente ao mais antigo). */
function groupByMonth(entries: EnrichedDiaryEntry[]): EntryGroup[] {
  const groups: EntryGroup[] = [];
  const groupsByLabel = new Map<string, EntryGroup>();

  entries.forEach((entry) => {
    const label = formatMonthGroupLabel(entry.date);
    let group = groupsByLabel.get(label);

    if (!group) {
      group = { label, entries: [] };
      groupsByLabel.set(label, group);
      groups.push(group);
    }

    group.entries.push(entry);
  });

  return groups;
}

interface DiaryEntryListProps {
  query: ReturnType<typeof useDiaryEntries>;
  /** Algum filtro de período ou de sintoma está ligado. */
  filtered: boolean;
}

/**
 * A lista do histórico, com os quatro estados: skeleton na forma da lista,
 * erro com nova tentativa, vazio (que muda conforme haja filtro ou não) e o
 * conteúdo, com o "carregar mais" da paginação por chave.
 */
export default function DiaryEntryList({ query, filtered }: DiaryEntryListProps) {
  const navigate = useNavigate();
  const entries = query.data;

  let content: ReactNode;

  if (query.isLoading) {
    content = <EntriesSkeleton />;
  } else if (query.isError && entries === undefined) {
    // Dado em mãos vence o erro (ver o "carregar mais" abaixo); sem dado
    // nenhum, "não sei" nunca vira "vazio".
    content = (
      <ErrorState
        title="Não foi possível carregar seus registros"
        description="Verifique sua conexão e tente novamente."
        onRetry={() => void query.refetch()}
      />
    );
  } else if (!entries || entries.length === 0) {
    content = filtered ? (
      <EmptyState
        title="Nenhum registro encontrado"
        description="Tente ajustar os filtros ou registre como você está se sentindo."
      />
    ) : (
      // Sem filtro nenhum, "ajuste os filtros" não faz sentido: é quem ainda
      // não começou o diário.
      <EmptyState
        title="Você ainda não fez registros"
        description="Registrar como você está ajuda sua equipe a te acompanhar melhor."
        actionLabel="Fazer meu primeiro registro"
        onAction={() => navigate('/diario/novo')}
      />
    );
  } else {
    content = (
      <>
        {groupByMonth(entries).map((group, index) => (
          <section key={group.label}>
            <h3
              className={cn(
                'mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground',
                index === 0 ? 'mt-0' : 'mt-5'
              )}
            >
              {group.label}
            </h3>
            <div className="flex flex-col gap-2">
              {group.entries.map((entry) => (
                <DiaryEntryCard registro={entry} key={entry.id} />
              ))}
            </div>
          </section>
        ))}

        {query.hasNextPage && (
          <div className="mt-5">
            {query.isFetchNextPageError ? (
              // No TanStack Query, "carregar mais" que falha também marca a
              // consulta como erro — mas os registros já carregados continuam
              // na tela, e só esta página pede nova tentativa.
              <InlineError
                title="Não foi possível carregar mais registros"
                onRetry={() => void query.fetchNextPage()}
              />
            ) : (
              <Button
                fullWidth
                variant="outline"
                loading={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                Carregar mais registros
              </Button>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <div
      // Lista ainda do filtro anterior: esmaecida e sem toque, até a nova
      // chegar — mesmo tratamento da biblioteca de Orientações.
      //
      // `mb-24`: o último item tem de parar acima do botão flutuante "+" (a
      // 80px do fundo, com 52px de altura). Com menos folga ele cobria a ponta
      // do "Carregar mais", e um toque ali abria "novo registro".
      className={cn(
        'mx-6 mt-5 mb-24 flex-1 transition-opacity duration-150 ease-[ease]',
        query.isPlaceholderData && 'pointer-events-none opacity-60'
      )}
      aria-busy={query.isPlaceholderData}
    >
      {content}
    </div>
  );
}
