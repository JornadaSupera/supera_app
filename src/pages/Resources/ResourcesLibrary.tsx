import { useState } from 'react';
import Tag from '../../components/ui/tag';
import Loading from '../../components/ui/loading';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import BottomTab from '../../components/ui/bottom-tab';
import ResourceCard from './ResourceCard';
import { useOrientationCategories, useOrientations } from '../../hooks/useResources';
import { usePatient } from '../../hooks/usePatient';
import { cn } from '../../lib/utils';
import type { OrientationDetail, OrientationFilters } from '../../types';

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

  // `categoriaFiltro` guarda o CODE da categoria, não o rótulo: rótulo é
  // conteúdo que a clínica edita, e um filtro chaveado nele quebraria na
  // primeira correção de texto feita no banco.
  const filtros: OrientationFilters = {
    categoria: categoriaFiltro || undefined,
    tipo: undefined,
    favoritas: statusFiltro === 'favoritas' || undefined,
    naoLidas: statusFiltro === 'nao-lidas' || undefined,
  };

  const {
    data: orientacoes = [],
    isLoading: carregandoOrientacoes,
    isError: erroOrientacoes,
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
      <ErrorState
        onRetry={() => {
          void recarregarOrientacoes();
          void recarregarCategorias();
        }}
      />
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
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-[color-mix(in_srgb,var(--color-background)_95%,transparent)] px-6 pt-6 pb-3 backdrop-blur-[8px]">
        <p className="text-[12px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
          ORIENTAÇÕES
        </p>
        <h1 className="mt-0.5 text-[24px] font-semibold tracking-[-0.6px] text-foreground">
          Biblioteca
        </h1>

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
      </header>

      <div className="mx-6 mt-5 mb-8 flex-1">
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
                  'mb-3 text-[12px] font-medium tracking-[0.05em] text-muted-foreground',
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

      <BottomTab />
    </div>
  );
}
