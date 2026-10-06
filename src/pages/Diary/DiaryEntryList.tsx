import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import EmptyState from '../../components/ui/empty-state';
import { CARE_PHRASES } from '../../components/ui/affective-phrase';
import ErrorState from '../../components/ui/error-state';
import LoadMore from '../../components/ui/load-more';
import SectionHeading from '../../components/ui/section-heading';
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
      // Também com filtro a tela fica vazia: a touceira de flores e a frase de
      // apoio, como na de quem ainda não começou (pedido de 06/10).
      <EmptyState
        illustration
        phrase={CARE_PHRASES.seeBeauty}
        title="Nenhum registro encontrado"
        description="Tente ajustar os filtros ou registre como você está se sentindo."
      />
    ) : (
      // Sem filtro nenhum, "ajuste os filtros" não faz sentido: é quem ainda
      // não começou o diário. Leva a pintura da touceira de flores, como as
      // telas vazias do guia; a vazia por filtro fica com o ícone. O botão é
      // `outline`: o principal da tela é o "+" do Diário, que faz o mesmo, e o
      // guia pede um só principal por tela.
      <EmptyState
        illustration
        phrase={CARE_PHRASES.seeBeauty}
        actionVariant="outline"
        title="Você ainda não fez registros"
        description="Registrar como você está ajuda sua equipe a te acompanhar melhor."
        actionLabel="Fazer meu primeiro registro"
        onAction={() => navigate('/diario/novo')}
      />
    );
  } else {
    content = (
      <>
        {/* Cada mês é uma seção da tela, com o título na faixa do guia
            (`SectionHeading`, que já desfaz os 16 px da margem da tela), como
            as seções da Agenda e das Notificações. 32 px entre os meses e
            12 px entre a faixa e os cards, pelo `gap`: o reset global do
            `index.css` zera a margem do `h2`. */}
        <div className="flex flex-col gap-8">
          {groupByMonth(entries).map((group) => (
            <section key={group.label} className="flex flex-col gap-3">
              <SectionHeading>{group.label}</SectionHeading>
              <div className="flex flex-col gap-2">
                {group.entries.map((entry) => (
                  <DiaryEntryCard registro={entry} key={entry.id} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <LoadMore
          hasMore={query.hasNextPage}
          isLoading={query.isFetchingNextPage}
          hasError={query.isFetchNextPageError}
          onLoadMore={() => void query.fetchNextPage()}
          label="Carregar mais registros"
          errorTitle="Não foi possível carregar mais registros"
        />
      </>
    );
  }

  return (
    <div
      // Lista ainda do filtro anterior: esmaecida e sem toque, até a nova
      // chegar — mesmo tratamento da biblioteca de Orientações.
      //
      // `mt-5`: somado aos 4 px que a fileira de chips deixa abaixo dela, dá
      // os 24 px do guia entre os filtros e a lista.
      //
      // `mb-24`: o último item tem de parar acima do botão flutuante "+" (56 px
      // de altura, 16 px acima da barra de abas e da faixa do gesto). Com menos
      // folga ele cobria a ponta do "Carregar mais", e um toque ali abria
      // "novo registro".
      className={cn(
        'mx-4 mt-5 mb-24 flex-1 transition-opacity duration-150 ease-[ease]',
        query.isPlaceholderData && 'pointer-events-none opacity-60'
      )}
      aria-busy={query.isPlaceholderData}
    >
      {content}
    </div>
  );
}
