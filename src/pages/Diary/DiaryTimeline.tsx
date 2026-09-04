import { useState } from 'react';
import { Link } from 'react-router';
import { TrendingUp, Plus } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import Card from '../../components/ui/card';
import Tag from '../../components/ui/tag';
import SelectMenu from '../../components/ui/select-menu';
import Loading from '../../components/ui/loading';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import BottomTab from '../../components/ui/bottom-tab';
import DiaryEntryCard from './DiaryEntryCard';
import { useDiaryEntries, useSymptomEvolution, useSymptoms } from '../../hooks/useDiary';
import { daysFromToday, formatMonthGroupLabel } from '../../utils/date';
import type { EnrichedDiaryEntry } from '../../types';

interface EntryGroup {
  label: string;
  registros: EnrichedDiaryEntry[];
}

export default function DiaryTimeline() {
  const [periodoDias, setPeriodoDias] = useState<number | null>(null);
  const [sintomaFiltro, setSintomaFiltro] = useState<string | null>(null);
  const [metricaId, setMetricaId] = useState<string | null>(null);

  const {
    data: sintomas = [],
    isLoading: carregandoSintomas,
    isError: erroSintomas,
    refetch: recarregarSintomas,
  } = useSymptoms();

  // O gráfico plota um sintoma por vez — é a "seleção de métrica" do escopo.
  // Sem escolha explícita, mostra o primeiro do catálogo, para a tela nunca
  // abrir com um gráfico vazio esperando interação.
  const metricaSelecionada = metricaId ?? sintomas[0]?.id;

  const { data: evolucao = [], isLoading: carregandoEvolucao } =
    useSymptomEvolution(metricaSelecionada);

  const {
    data: registros = [],
    isLoading: carregandoRegistros,
    isError: erroRegistros,
    refetch: recarregarRegistros,
  } = useDiaryEntries({
    periodDays: periodoDias === null ? undefined : periodoDias,
    symptomId: sintomaFiltro === null ? undefined : sintomaFiltro,
  });

  if (carregandoSintomas || carregandoRegistros || carregandoEvolucao) {
    return <Loading />;
  }

  if (erroSintomas || erroRegistros) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <ErrorState
          title="Não foi possível carregar seu diário"
          description="Verifique sua conexão e tente novamente."
          onRetry={() => {
            void recarregarSintomas();
            void recarregarRegistros();
          }}
        />
        <BottomTab />
      </div>
    );
  }

  const registrosUltimos7Dias = registros.filter(
    (registro) => daysFromToday(registro.entryDate) >= -7
  ).length;

  const grupos: EntryGroup[] = [];
  const gruposPorLabel = new Map<string, EntryGroup>();
  registros.forEach((registro) => {
    const label = formatMonthGroupLabel(registro.date);
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
          <SelectMenu
            value={metricaSelecionada ?? ''}
            onChange={setMetricaId}
            options={sintomas.map((sintoma) => ({ value: sintoma.id, label: sintoma.label }))}
            aria-label="Sintoma exibido no gráfico"
          />
        </div>

        <div className="mt-3">
          {evolucao.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-muted-foreground">
              Ainda não há registros desse sintoma para montar o gráfico.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={evolucao}>
                <defs>
                  <linearGradient id="evolucaoGradiente" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-supera-empatia)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-supera-empatia)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                <XAxis
                  dataKey="dateLabel"
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
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Intensidade"
                  stroke="var(--color-supera-empatia)"
                  strokeWidth={2}
                  fill="url(#evolucaoGradiente)"
                  dot={{ r: 3, fill: 'var(--color-supera-empatia)' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          0 = não senti · 5 = insuportável
        </p>
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
          {sintomas.map((sintoma) => (
            <Tag
              key={sintoma.id}
              selected={sintomaFiltro === sintoma.id}
              onClick={() => setSintomaFiltro(sintoma.id)}
            >
              {sintoma.label}
            </Tag>
          ))}
        </div>
      </div>

      <div className="mx-6 mt-5 mb-8 flex-1">
        {registros.length === 0 ? (
          <EmptyState
            title="Nenhum registro encontrado"
            description="Tente ajustar os filtros ou registre como você está se sentindo."
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
