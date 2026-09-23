import { useState } from 'react';
import { Search, TriangleAlert } from 'lucide-react';
import Tag from '../../components/ui/tag';
import Input from '../../components/ui/input';
import Button from '../../components/ui/button';
import Skeleton from '../../components/ui/skeleton';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import TabHeader from '../../components/ui/tab-header';
import TabScreen from '../../components/ui/tab-screen';
import ResourceCard from './ResourceCard';
import { useOrientationCategories, useOrientations } from '../../hooks/useResources';
import { usePatient } from '../../hooks/usePatient';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { cn } from '../../lib/utils';
import type { OrientationDetail, OrientationFilters } from '../../types';

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
  itens: OrientationDetail[];
}

/** Carregamento com a forma da biblioteca: título de seção e cards. */
function LibrarySkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando orientações">
      <Skeleton className="h-3 w-32" />
      <div className="mt-3 flex flex-col gap-2">
        {[0, 1, 2].map((linha) => (
          <div
            key={linha}
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5"
          >
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="mt-2 h-3 w-full" />
              <Skeleton className="mt-1.5 h-3 w-2/3" />
              <Skeleton className="mt-2.5 h-4 w-16 rounded-md" />
            </div>
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
  const filtros: OrientationFilters = {
    categoria: categoriaFiltro || undefined,
    tipo: undefined,
    favoritas: statusFiltro === 'favoritas' || undefined,
    naoLidas: statusFiltro === 'nao-lidas' || undefined,
    busca: buscaAplicada.trim() || undefined,
  };

  const {
    data: orientacoes = [],
    isLoading: carregandoOrientacoes,
    isError: erroOrientacoes,
    isPlaceholderData: listaDoFiltroAnterior,
    refetch: recarregarOrientacoes,
  } = useOrientations(filtros);

  const {
    data: categorias = [],
    isLoading: carregandoCategorias,
    isError: erroCategorias,
    refetch: recarregarCategorias,
  } = useOrientationCategories();

  // Só o diagnóstico é usado nesta tela (o chip "filtrado pelo seu
  // diagnóstico"), mas a leitura real do paciente vem inteira — não há uma
  // consulta menor para pedir só esse campo.
  //
  // Fora do carregamento da biblioteca de propósito: o chip é informação de
  // apoio, e a lista não deve esperar por ele. Quando ele falha, o aviso
  // aparece no lugar do chip — antes o chip sumia sem explicação, e a pessoa
  // ficava sem saber se a biblioteca tinha deixado de ser filtrada.
  const {
    data: paciente,
    isLoading: carregandoPaciente,
    isError: erroPaciente,
    refetch: recarregarPaciente,
  } = usePatient();

  const carregandoBiblioteca = carregandoOrientacoes || carregandoCategorias;

  if (erroOrientacoes || erroCategorias) {
    return (
      <TabScreen header={<TabHeader eyebrow="ORIENTAÇÕES" title="Biblioteca" />}>
        <ErrorState
          onRetry={() => {
            void recarregarOrientacoes();
            void recarregarCategorias();
          }}
        />
      </TabScreen>
    );
  }

  const diagnostico = paciente?.diagnostico;

  // A lista já vem ordenada por categoria (ordem do catálogo) e, dentro
  // dela, da mais recente à mais antiga — então agrupar na ordem de chegada
  // preserva essa ordenação sem reordenar nada aqui.
  const grupos: Grupo[] = [];
  const gruposPorCategoria = new Map<string, Grupo>();
  orientacoes.forEach((orientacao) => {
    let grupo = gruposPorCategoria.get(orientacao.categoriaCode);
    if (!grupo) {
      grupo = { code: orientacao.categoriaCode, label: orientacao.categoria, itens: [] };
      gruposPorCategoria.set(orientacao.categoriaCode, grupo);
      grupos.push(grupo);
    }
    grupo.itens.push(orientacao);
  });

  return (
    <TabScreen
      header={
        <TabHeader eyebrow="ORIENTAÇÕES" title="Biblioteca">
          {carregandoPaciente && <Skeleton className="mt-4 h-[58px] rounded-xl" />}

          {!carregandoPaciente && diagnostico && (
            <div className="mt-4 rounded-xl border border-border bg-[color-mix(in_srgb,var(--color-muted)_30%,transparent)] p-3">
              <p className="text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
                FILTRADO PELO SEU DIAGNÓSTICO
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-foreground">
                <span className="text-primary">{diagnostico.cid}</span>
                <span className="ml-1 text-muted-foreground">·</span>
                <span className="ml-1">{diagnostico.descricao}</span>
              </p>
            </div>
          )}

          {!carregandoPaciente && erroPaciente && (
            // O recorte por diagnóstico é imposto pela RLS, não por este chip
            // — por isso o aviso diz que a lista continua filtrada, em vez de
            // sugerir que o conteúdo possa estar vindo errado.
            <div
              role="status"
              className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-[color-mix(in_srgb,var(--color-muted)_30%,transparent)] p-3"
            >
              <TriangleAlert
                size={14}
                strokeWidth={2}
                className="mt-px shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12px]/[1.45] text-muted-foreground">
                  Não foi possível carregar seu diagnóstico agora. A biblioteca continua filtrada
                  pelo seu cadastro.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => void recarregarPaciente()}
                >
                  Tentar de novo
                </Button>
              </div>
            </div>
          )}

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
            <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
              {STATUS_FILTROS.map((item) => (
                <Tag
                  key={item.key}
                  selected={statusFiltro === item.key}
                  onClick={() => setStatusFiltro(item.key)}
                >
                  {item.label}
                </Tag>
              ))}
            </div>

            <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
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
            </div>
          </div>
        </TabHeader>
      }
    >
      <div
        // Enquanto a lista ainda é do filtro anterior (`keepPreviousData`),
        // ela esmaece e não aceita toque: sem isso, os itens parecem ser do
        // filtro novo, e daria pra favoritar/abrir algo que nem pertence a ele.
        className={cn(
          'mx-6 mt-5 mb-8 flex-1 transition-opacity duration-150 ease-[ease]',
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
          grupos.map((grupo, index) => (
            <section key={grupo.code}>
              <h3
                className={cn(
                  'mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground',
                  index === 0 ? 'mt-0' : 'mt-6'
                )}
              >
                {grupo.label.toUpperCase()} · {grupo.itens.length}
              </h3>
              <div className="flex flex-col gap-2">
                {grupo.itens.map((orientacao) => (
                  <ResourceCard orientacao={orientacao} key={orientacao.id} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </TabScreen>
  );
}
