import { useState } from 'react';
import { Search, TriangleAlert } from 'lucide-react';
import Tag from '../../components/ui/tag';
import ChipRow from '../../components/ui/chip-row';
import Input from '../../components/ui/input';
import Button from '../../components/ui/button';
import Skeleton from '../../components/ui/skeleton';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import TabHeader from '../../components/ui/tab-header';
import TabScreen from '../../components/ui/tab-screen';
import SectionHeading from '../../components/ui/section-heading';
import ResourceCard from './ResourceCard';
import { useResourceCategories, useResources } from '../../hooks/useResources';
import { usePatient } from '../../hooks/usePatient';
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

  // Só o diagnóstico é usado nesta tela (o banner "Filtrado pelo seu
  // diagnóstico"), mas a leitura real do paciente vem inteira — não há uma
  // consulta menor para pedir só esse campo.
  //
  // Fora do carregamento da biblioteca de propósito: o banner é informação de
  // apoio, e a lista não deve esperar por ele. Quando ele falha, o aviso
  // aparece no lugar do banner — antes o banner sumia sem explicação, e a
  // pessoa ficava sem saber se a biblioteca tinha deixado de ser filtrada.
  const {
    data: paciente,
    isLoading: carregandoPaciente,
    isError: erroPaciente,
    refetch: recarregarPaciente,
  } = usePatient();

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

  const diagnostico = paciente?.diagnosis;

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

            <ChipRow>
              <Tag selected={categoriaFiltro === null} onClick={() => setCategoriaFiltro(null)}>
                Todas
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
          </div>
        </TabHeader>
      }
    >
      {/* O diagnóstico rola com a lista, e não no cabeçalho fixo: preso, o
          banner (e o aviso de falha, maior) tomava quase metade da tela do
          celular. Fica fora do bloco que esmaece na troca de filtro, que não o
          afeta. As margens são as da lista: 16 px dos lados, 24 px até o
          cabeçalho. */}
      {(carregandoPaciente || diagnostico || erroPaciente) && (
        <div className="mx-4 mt-6 flex flex-col gap-4">
          {/* A altura do banner com o diagnóstico numa linha só (73 px): os
              16 px de respiro em cima e embaixo, a legenda de 18, o vão de 2 e
              a linha de 21 do `text-body-sm`. */}
          {carregandoPaciente && <Skeleton className="h-[73px] rounded-2xl" />}

          {/* O banner do CID do guia: a caixa verde-água clara (`surface-teal`),
              com o texto em `ink` e o código no verde escuro. */}
          {!carregandoPaciente && diagnostico && (
            <div className="flex flex-col gap-0.5 rounded-2xl bg-secondary p-4">
              <p className="text-caption font-semibold text-primary-deep">Filtrado pelo seu diagnóstico</p>
              <p className="text-body-sm font-medium text-foreground">
                <span className="font-bold text-primary-deep">{diagnostico.cid}</span>
                <span className="ml-1 text-foreground">·</span>
                <span className="ml-1">{diagnostico.description}</span>
              </p>
            </div>
          )}

          {!carregandoPaciente && erroPaciente && (
            // O recorte por diagnóstico é imposto pela RLS, não por este banner
            // — por isso o aviso diz que a lista continua filtrada, em vez de
            // sugerir que o conteúdo possa estar vindo errado.
            <div role="status" className="flex items-start gap-3 rounded-2xl bg-muted p-4">
              {/* Centrado na primeira linha de 21 px do `text-body-sm`. */}
              <TriangleAlert
                size={24}
                strokeWidth={2}
                className="-my-[1.5px] shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="text-body-sm text-muted-foreground">
                  Não foi possível carregar seu diagnóstico agora. A biblioteca continua filtrada
                  pelo seu cadastro.
                </p>
                {/* `self-start`: na coluna, o botão manteria a largura toda. */}
                <Button variant="outline" className="self-start" onClick={() => void recarregarPaciente()}>
                  Tentar de novo
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div
        // Enquanto a lista ainda é do filtro anterior (`keepPreviousData`),
        // ela esmaece e não aceita toque: sem isso, os itens parecem ser do
        // filtro novo, e daria pra favoritar/abrir algo que nem pertence a ele.
        // A margem de 16 px é a do cabeçalho (`TabHeader`) e a das telas no guia;
        // os 24 px até o bloco de cima (o banner do diagnóstico ou, sem ele, o
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
          <EmptyState
            title="Nenhuma orientação encontrada"
            description="Tente ajustar os filtros para ver outros conteúdos."
          />
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
