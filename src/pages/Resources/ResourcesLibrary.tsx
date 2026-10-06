import { useState } from 'react';
import { Search } from 'lucide-react';
import Tag from '../../components/ui/tag';
import ChipRow from '../../components/ui/chip-row';
import Input from '../../components/ui/input';
import Skeleton from '../../components/ui/skeleton';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import TabHeader from '../../components/ui/tab-header';
import TabScreen from '../../components/ui/tab-screen';
import SectionHeading from '../../components/ui/section-heading';
import ResourceCard from './ResourceCard';
import LibraryFilterNotice from './LibraryFilterNotice';
import { useResourceCategories, useResources } from '../../hooks/useResources';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { cn } from '../../lib/utils';
import type { EnrichedResource, ResourceFilters } from '../../types';

/** Pausa na digitação antes de a busca virar filtro (e chave de query). */
const BUSCA_DEBOUNCE_MS = 300;

const STATUS_FILTROS = [
  { key: 'todas', label: 'Todas' },
  { key: 'favoritas', label: 'Favoritas' },
  { key: 'nao-lidas', label: 'Não lidas' },
] as const;

type StatusFiltro = (typeof STATUS_FILTROS)[number]['key'];

interface Grupo {
  /** `content_categories.code` — chave estável do agrupamento. */
  code: string;
  /** `content_categories.label` — o que aparece no cabeçalho da seção. */
  label: string;
  itens: EnrichedResource[];
}

/**
 * Carregamento com a forma da biblioteca: a faixa do título de seção e os
 * cards (etiqueta, título, resumo em duas linhas e rodapé). Cada bloco ocupa a
 * linha que representa — 24 px da etiqueta com a estrela, 22 do título, 2 × 21
 * do resumo e 18 do rodapé —, e o card fica da altura do card de verdade com
 * o título numa linha só.
 */
function LibrarySkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando orientações">
      <Skeleton className="-ml-4 h-12 w-3/5 rounded-l-none rounded-r-lg" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((linha) => (
          <div
            key={linha}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <Skeleton className="my-px h-[22px] w-24 rounded-full" />
            <Skeleton className="my-px h-5 w-4/5" />
            <div className="flex flex-col gap-1.5 py-0.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <Skeleton className="my-px h-4 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ResourcesLibrary() {
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>('todas');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  // O campo reflete cada tecla na hora; o filtro (que é chave de query e
  // dispara leitura no servidor) só muda depois de uma pausa na digitação.
  const buscaAplicada = useDebouncedValue(busca, BUSCA_DEBOUNCE_MS);

  // `categoriaFiltro` guarda o CODE da categoria, não o rótulo: rótulo é
  // conteúdo que a clínica edita, e um filtro chaveado nele quebraria na
  // primeira correção de texto feita no banco.
  const filtros: ResourceFilters = {
    category: categoriaFiltro || undefined,
    type: undefined,
    favoritesOnly: statusFiltro === 'favoritas' || undefined,
    unreadOnly: statusFiltro === 'nao-lidas' || undefined,
    search: buscaAplicada.trim() || undefined,
  };
  const hasActiveFilter =
    filtros.category !== undefined ||
    filtros.favoritesOnly !== undefined ||
    filtros.unreadOnly !== undefined ||
    filtros.search !== undefined;

  const {
    data: orientacoes = [],
    isLoading: carregandoOrientacoes,
    isError: erroOrientacoes,
    isPlaceholderData: listaDoFiltroAnterior,
    refetch: recarregarOrientacoes,
  } = useResources(filtros);

  const {
    data: categorias = [],
    isLoading: carregandoCategorias,
    isError: erroCategorias,
    refetch: recarregarCategorias,
  } = useResourceCategories();

  const carregandoBiblioteca = carregandoOrientacoes || carregandoCategorias;

  if (erroOrientacoes || erroCategorias) {
    return (
      <TabScreen header={<TabHeader eyebrow="Orientações" title="Biblioteca" />}>
        <ErrorState
          onRetry={() => {
            void recarregarOrientacoes();
            void recarregarCategorias();
          }}
        />
      </TabScreen>
    );
  }

  // A lista já vem ordenada por categoria (ordem do catálogo) e, dentro
  // dela, da mais recente à mais antiga — então agrupar na ordem de chegada
  // preserva essa ordenação sem reordenar nada aqui.
  const grupos: Grupo[] = [];
  const gruposPorCategoria = new Map<string, Grupo>();
  orientacoes.forEach((orientacao) => {
    let grupo = gruposPorCategoria.get(orientacao.categoryCode);
    if (!grupo) {
      grupo = { code: orientacao.categoryCode, label: orientacao.category, itens: [] };
      gruposPorCategoria.set(orientacao.categoryCode, grupo);
      grupos.push(grupo);
    }
    grupo.itens.push(orientacao);
  });

  return (
    <TabScreen
      header={
        <TabHeader eyebrow="Orientações" title="Biblioteca">
          <Input
            type="search"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar por título ou conteúdo"
            aria-label="Buscar orientação por título ou conteúdo"
            iconLeft={Search}
            className="mt-4"
          />

          <div className="mt-4 flex flex-col gap-2">
            <ChipRow>
              {STATUS_FILTROS.map((item) => (
                <Tag
                  key={item.key}
                  selected={statusFiltro === item.key}
                  onClick={() => setStatusFiltro(item.key)}
                >
                  {item.label}
                </Tag>
              ))}
            </ChipRow>

            {/* "Todos os temas", e não um segundo "Todas" logo abaixo do da
                primeira fileira: as duas pareciam o mesmo filtro. Sem tema
                nenhum no catálogo, a fileira não aparece. */}
            {categorias.length > 0 && (
              <ChipRow>
                <Tag selected={categoriaFiltro === null} onClick={() => setCategoriaFiltro(null)}>
                  Todos os temas
                </Tag>
                {categorias.map((categoria) => (
                  <Tag
                    key={categoria.code}
                    selected={categoriaFiltro === categoria.code}
                    onClick={() => setCategoriaFiltro(categoria.code)}
                  >
                    {categoria.label}
                  </Tag>
                ))}
              </ChipRow>
            )}
          </div>
        </TabHeader>
      }
    >
      {/* A faixa do filtro por CID rola com a lista, e não no cabeçalho fixo:
          presa, ela (e o aviso de falha, maior) tomava quase metade da tela do
          celular. Fica fora do bloco que esmaece na troca de filtro, que não a
          afeta. */}
      <LibraryFilterNotice />

      <div
        // Enquanto a lista ainda é do filtro anterior (`keepPreviousData`),
        // ela esmaece e não aceita toque: sem isso, os itens parecem ser do
        // filtro novo, e daria pra favoritar/abrir algo que nem pertence a ele.
        // A margem de 16 px é a do cabeçalho (`TabHeader`) e a das telas no guia;
        // os 24 px até o bloco de cima (a faixa do filtro por CID ou, sem ela, o
        // cabeçalho), o espaço entre blocos do guia.
        className={cn(
          'mx-4 mt-6 mb-8 flex-1 transition-opacity duration-150 ease-[ease]',
          listaDoFiltroAnterior && 'pointer-events-none opacity-60'
        )}
        aria-busy={listaDoFiltroAnterior}
      >
        {carregandoBiblioteca ? (
          <LibrarySkeleton />
        ) : orientacoes.length === 0 ? (
          // "Ajuste os filtros" só quando há filtro ou busca. Sem nenhum, a
          // biblioteca está vazia de verdade — a equipe ainda não publicou — e
          // leva a touceira de flores, como as outras telas vazias do guia.
          hasActiveFilter ? (
            <EmptyState
              title="Nenhuma orientação encontrada"
              description="Tente ajustar a busca ou os filtros para ver outros conteúdos."
            />
          ) : (
            <EmptyState
              illustration
              title="Ainda não há orientações"
              description="Quando a sua equipe publicar orientações para você, elas aparecem aqui."
            />
          )
        ) : (
          // Cada categoria abre com a faixa clara do Manual ("TituloSecao"),
          // em frase normal, e os grupos ficam a 32 px um do outro.
          <div className="flex flex-col gap-8">
            {grupos.map((grupo) => (
              <section key={grupo.code} className="flex flex-col gap-3">
                <SectionHeading>
                  {grupo.label} <span className="font-semibold">· {grupo.itens.length}</span>
                </SectionHeading>
                <div className="flex flex-col gap-2">
                  {grupo.itens.map((orientacao) => (
                    <ResourceCard orientacao={orientacao} key={orientacao.id} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </TabScreen>
  );
}
