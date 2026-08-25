import { useEffect, useState } from 'react';
import { Link } from 'react-router';
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
import Card from '../../components/Card';
import Tag from '../../components/Tag';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import BottomTab from '../../components/BottomTab';
import DiaryEntryCard from './DiaryEntryCard';
import { getRegistrosDiario, getEvolucaoHumor, getSintomasDisponiveis } from '../../services/mockApi';
import { formatMonthGroupLabel } from '../../utils/date';
import styles from './DiaryTimeline.module.css';

export default function DiaryTimeline() {
  const [carregando, setCarregando] = useState(true);
  const [registros, setRegistros] = useState([]);
  const [evolucao, setEvolucao] = useState([]);
  const [sintomasDisponiveis, setSintomasDisponiveis] = useState([]);

  const [periodoDias, setPeriodoDias] = useState(null);
  const [sintomaFiltro, setSintomaFiltro] = useState(null);

  useEffect(() => {
    let ativo = true;

    async function carregarInicial() {
      setCarregando(true);
      const [registrosData, evolucaoData, sintomasData] = await Promise.all([
        getRegistrosDiario(),
        getEvolucaoHumor({ limit: 7 }),
        getSintomasDisponiveis(),
      ]);

      if (!ativo) return;
      setRegistros(registrosData);
      setEvolucao(evolucaoData);
      setSintomasDisponiveis(sintomasData);
      setCarregando(false);
    }

    carregarInicial();

    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    if (carregando) return;

    let ativo = true;

    getRegistrosDiario({
      periodoDias: periodoDias === null ? undefined : periodoDias,
      sintoma: sintomaFiltro,
    }).then((data) => {
      if (ativo) setRegistros(data);
    });

    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoDias, sintomaFiltro]);

  if (carregando) {
    return <Loading />;
  }

  const registrosUltimos7Dias = registros.filter((registro) => registro.diasAPartirDeHoje >= -7).length;

  const grupos = [];
  const gruposPorLabel = new Map();
  registros.forEach((registro) => {
    const label = formatMonthGroupLabel(registro.data);
    if (!gruposPorLabel.has(label)) {
      const grupo = { label, registros: [] };
      gruposPorLabel.set(label, grupo);
      grupos.push(grupo);
    }
    gruposPorLabel.get(label).registros.push(registro);
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>MEU DIÁRIO</p>
        <h1 className={styles.title}>Como tenho me sentido</h1>

        <div className={styles.statCard}>
          <div>
            <p className={styles.statLabel}>ÚLTIMOS 7 DIAS</p>
            <p className={styles.statValue}>
              {registrosUltimos7Dias} registros · você está atento ao seu corpo 💙
            </p>
          </div>
        </div>
      </header>

      <Card padding="md" className={styles.chartCard}>
        <div className={styles.chartHeaderRow}>
          <div className={styles.chartTitleGroup}>
            <span className={styles.chartIconWrapper}>
              <TrendingUp size={16} strokeWidth={2} aria-hidden="true" />
            </span>
            <h3 className={styles.chartTitle}>Evolução</h3>
          </div>
          <select className={styles.metricSelect} defaultValue="humor" aria-label="Métrica exibida no gráfico">
            <option value="humor">Humor geral</option>
          </select>
        </div>

        <div className={styles.chartWrapper}>
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

        <p className={styles.chartLegend}>0 = ótimo · 5 = muito intenso</p>
      </Card>

      <div className={styles.filters}>
        <div className={styles.filterRow}>
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

        <div className={styles.filterRow}>
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

      <div className={styles.list}>
        {registros.length === 0 ? (
          <EmptyState
            title="Nenhum registro encontrado"
            description="Tente ajustar os filtros ou registre como você está se sentindo."
          />
        ) : (
          grupos.map((grupo, index) => (
            <section key={grupo.label}>
              <h3 className={index === 0 ? styles.groupTitleFirst : styles.groupTitle}>{grupo.label}</h3>
              <div className={styles.groupEntries}>
                {grupo.registros.map((registro) => (
                  <DiaryEntryCard registro={registro} key={registro.id} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <Link to="/diario/novo" aria-label="Novo registro no diário" className={styles.fab}>
        <Plus size={20} strokeWidth={2.5} aria-hidden="true" />
      </Link>

      <BottomTab />
    </div>
  );
}
