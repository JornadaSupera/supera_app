import { useState } from 'react';
import { Search } from 'lucide-react';
import Tag from '../../components/ui/tag';
import Input from '../../components/ui/input';
import Loading from '../../components/ui/loading';
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
  const { data: paciente, isLoading: carregandoPaciente } = usePatient();

  const carregando = carregandoOrientacoes || carregandoCategorias || carregandoPaciente;

  if (carregando) {
    return <Loading />;
  }

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
          {diagnostico && (
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

          <Input
            type="search"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar por título"
            aria-label="Buscar orientação por título"
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
        {orientacoes.length === 0 ? (
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
