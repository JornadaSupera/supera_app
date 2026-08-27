import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { TrendingUp, Plus } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import Card from '../../components/ui/card';
import Tag from '../../components/ui/tag';
import Loading from '../../components/ui/loading';
import EmptyState from '../../components/ui/empty-state';
import BottomTab from '../../components/ui/bottom-tab';
import DiaryEntryCard from './DiaryEntryCard';
import { getRegistrosDiario, getEvolucaoHumor, getSintomasDisponiveis } from '../../services/mockApi';
import { formatMonthGroupLabel } from '../../utils/date';
import type { EnrichedDiaryEntry, SymptomName } from '../../types';

interface EntryGroup {
  label: string;
  registros: EnrichedDiaryEntry[];
}

export default function DiaryTimeline() {
  const [periodoDias, setPeriodoDias] = useState<number | null>(null);
  const [sintomaFiltro, setSintomaFiltro] = useState<SymptomName | null>(null);

  const { data: sintomasDisponiveis = [], isLoading: carregandoSintomas } = useQuery({
    queryKey: ['available-symptoms'],
    queryFn: getSintomasDisponiveis,
  });

  const { data: evolucao = [], isLoading: carregandoEvolucao } = useQuery({
    queryKey: ['mood-evolution', { limit: 7 }],
    queryFn: () => getEvolucaoHumor({ limit: 7 }),
  });

  // `placeholderData: keepPreviousData` mantém a lista anterior visível
  // enquanto o novo filtro carrega em segundo plano — mesmo comportamento do
  // efeito original, que só substituía `registros` quando a nova resposta
  // chegava, sem voltar a mostrar o <Loading /> de página inteira.
  const { data: registros = [], isLoading: carregandoRegistros } = useQuery({
    queryKey: ['diary-entries', { periodoDias, sintoma: sintomaFiltro }],
    queryFn: () =>
      getRegistrosDiario({
        periodoDias: periodoDias === null ? undefined : periodoDias,
        sintoma: sintomaFiltro === null ? undefined : sintomaFiltro,
      }),
    placeholderData: keepPreviousData,
  });

  const carregando = carregandoSintomas || carregandoEvolucao || carregandoRegistros;

  if (carregando) {
    return <Loading />;
  }

  const registrosUltimos7Dias = registros.filter((registro) => registro.diasAPartirDeHoje >= -7).length;

  const grupos: EntryGroup[] = [];
  const gruposPorLabel = new Map<string, EntryGroup>();
  registros.forEach((registro) => {
    const label = formatMonthGroupLabel(registro.data);
    let grupo = gruposPorLabel.get(label);
    if (!grupo) {
      grupo = { label, registros: [] };
      gruposPorLabel.set(label, grupo);
      grupos.push(grupo);
    }
    grupo.registros.push(registro);
  });

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-[color-mix(in_srgb,var(--color-background)_95%,transparent)] px-6 pt-6 pb-4 backdrop-blur-[8px]">
        <p className="text-[12px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
          MEU DIÁRIO
        </p>
        <h1 className="mt-0.5 text-[24px] font-semibold tracking-[-0.6px] text-foreground">
          Como tenho me sentido
        </h1>

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-[color-mix(in_srgb,var(--color-muted)_50%,transparent)] p-3">
          <div>
            <p className="text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
              ÚLTIMOS 7 DIAS
            </p>
            <p className="mt-0.5 text-[14px] font-medium text-foreground">
              {registrosUltimos7Dias} registros · você está atento ao seu corpo 💙
            </p>
          </div>
        </div>
      </header>

      <Card padding="md" className="mx-6 mt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--color-supera-empatia)_15%,transparent)] p-1.5 text-[var(--color-supera-empatia)]">
              <TrendingUp size={16} strokeWidth={2} aria-hidden="true" />
            </span>
            <h3 className="text-[14px] font-semibold text-foreground">Evolução</h3>
          </div>
          <select
            className="rounded-md border border-border bg-card px-2 py-1 text-[12px] text-foreground"
            defaultValue="humor"
            aria-label="Métrica exibida no gráfico"
          >
            <option value="humor">Humor geral</option>
          </select>
        </div>

        <div className="mt-3">
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={evolucao}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
              <XAxis
                dataKey="dataLabel"
                tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 5]}
                ticks={[0, 1, 2, 3, 4, 5]}
                tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                width={20}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--color-popover)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="valor"
                stroke="var(--color-supera-empatia)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--color-supera-empatia)' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <p className="mt-2 text-center text-[11px] text-muted-foreground">0 = ótimo · 5 = muito intenso</p>
      </Card>

      <div className="mx-6 mt-4 flex flex-col gap-2">
        <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
          <Tag selected={periodoDias === null} onClick={() => setPeriodoDias(null)}>
            Tudo
          </Tag>
          <Tag selected={periodoDias === 7} onClick={() => setPeriodoDias(7)}>
            7 dias
          </Tag>
          <Tag selected={periodoDias === 30} onClick={() => setPeriodoDias(30)}>
            30 dias
          </Tag>
        </div>

        <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
          <Tag selected={sintomaFiltro === null} onClick={() => setSintomaFiltro(null)}>
            Todos os sintomas
          </Tag>
          {sintomasDisponiveis.map((sintoma) => (
            <Tag
              key={sintoma.nome}
              selected={sintomaFiltro === sintoma.nome}
              onClick={() => setSintomaFiltro(sintoma.nome)}
            >
              {sintoma.nome}
            </Tag>
          ))}
        </div>
      </div>

      <div className="mx-6 mt-5 mb-8 flex-1">
        {registros.length === 0 ? (
          <EmptyState
            title="Nenhum registro encontrado"
            description="Tente ajustar os filtros ou registre como você está se sentindo."
            // Header/EmptyState (old, .jsx) desestruturam `iconTone`/`actionLabel`/
            // `onAction` sem valor padrão, então o TS os infere como `any`
            // obrigatório para quem consome de um arquivo .tsx — precisam ser
            // passados mesmo que `undefined`. Mesma observação vale para os usos
            // de <Header variant="step" /> em EntryDetail.tsx e NewEntry.tsx.
            iconTone={undefined}
            actionLabel={undefined}
            onAction={undefined}
          />
        ) : (
          grupos.map((grupo, index) => (
            <section key={grupo.label}>
              <h3
                className={
                  index === 0
                    ? 'mt-0 mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground'
                    : 'mt-5 mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground'
                }
              >
                {grupo.label}
              </h3>
              <div className="flex flex-col gap-2">
                {grupo.registros.map((registro) => (
                  <DiaryEntryCard registro={registro} key={registro.id} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <Link
        to="/diario/novo"
        aria-label="Novo registro no diário"
        // Sombra composta (padrão + halo na cor da marca) escrita como um único
        // arbitrary value, igual ao box-shadow original — ver o mesmo padrão em
        // Input.tsx (foco) por este projeto evitar as utilities `ring-*`.
        className="fixed right-6 bottom-[80px] z-[25] inline-flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[var(--color-supera-empatia)] text-white shadow-[var(--shadow-lg),0_0_0_4px_color-mix(in_srgb,var(--color-supera-empatia)_20%,transparent)] transition-transform duration-150 ease-[ease] hover:scale-105 active:scale-95"
      >
        <Plus size={20} strokeWidth={2.5} aria-hidden="true" />
      </Link>

      <BottomTab />
    </div>
  );
}
