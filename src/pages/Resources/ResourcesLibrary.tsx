import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import Tag from '../../components/ui/tag';
import Loading from '../../components/ui/loading';
import EmptyState from '../../components/ui/empty-state';
import BottomTab from '../../components/ui/bottom-tab';
import ResourceCard from './ResourceCard';
import { getOrientacoes, getCategoriasOrientacoes } from '../../services/mockApi';
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
  categoria: string;
  itens: OrientationDetail[];
}

export default function ResourcesLibrary() {
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>('todas');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);

  // Mesmo shape de `OrientationFilters` em ambos, queryKey e queryFn — uma
  // única fonte evita o key/args divergirem entre si. `tipo` não tem filtro
  // de UI nesta tela (nenhum controle monta esse valor), mas entra explícito
  // no objeto pra a queryKey já sair no formato final de
  // `OrientationFilters` combinado.
  const filtros: OrientationFilters = {
    categoria: categoriaFiltro || undefined,
    tipo: undefined,
    favoritas: statusFiltro === 'favoritas' || undefined,
    naoLidas: statusFiltro === 'nao-lidas' || undefined,
  };

  // `placeholderData: keepPreviousData` mantém a lista anterior visível
  // enquanto o novo filtro carrega — mesmo comportamento do efeito original,
  // que só substituía `orientacoes` quando a nova resposta chegava, sem
  // voltar a mostrar o <Loading /> de página inteira a cada troca de filtro.
  const { data: orientacoes = [], isLoading: carregandoOrientacoes } = useQuery({
    queryKey: ['orientations', filtros],
    queryFn: () => getOrientacoes(filtros),
    placeholderData: keepPreviousData,
  });

  const { data: categorias = [], isLoading: carregandoCategorias } = useQuery({
    queryKey: ['orientation-categories'],
    queryFn: getCategoriasOrientacoes,
  });

  // Só o diagnóstico é usado nesta tela (o chip "filtrado pelo seu
  // diagnóstico"), mas a leitura real do paciente vem inteira — não há uma
  // consulta menor para pedir só esse campo.
  const { data: paciente, isLoading: carregandoPaciente } = usePatient();

  const carregando = carregandoOrientacoes || carregandoCategorias || carregandoPaciente;

  if (carregando) {
    return <Loading />;
  }

  const diagnostico = paciente?.diagnostico;

  const grupos: Grupo[] = [];
  const gruposPorCategoria = new Map<string, Grupo>();
  orientacoes.forEach((orientacao) => {
    let grupo = gruposPorCategoria.get(orientacao.categoria);
    if (!grupo) {
      grupo = { categoria: orientacao.categoria, itens: [] };
      gruposPorCategoria.set(orientacao.categoria, grupo);
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
                key={categoria}
                selected={categoriaFiltro === categoria}
                onClick={() => setCategoriaFiltro(categoria)}
              >
                {categoria}
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
            <section key={grupo.categoria}>
              <h3
                className={cn(
                  'mb-3 text-[12px] font-medium tracking-[0.05em] text-muted-foreground',
                  index === 0 ? 'mt-0' : 'mt-6'
                )}
              >
                {grupo.categoria.toUpperCase()} · {grupo.itens.length}
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
