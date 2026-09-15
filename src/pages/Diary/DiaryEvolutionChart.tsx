import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { SymptomEvolutionPoint } from '../../types';

interface DiaryEvolutionChartProps {
  data: SymptomEvolutionPoint[];
}

// Isolado em módulo próprio para o Recharts (~370 kB) só entrar em jogo
// quando este componente é montado — ver o `lazy()` em `DiaryTimeline.tsx`.
export default function DiaryEvolutionChart({ data }: DiaryEvolutionChartProps) {
  return (
    <ResponsiveContainer width="100%" height={170}>
      <AreaChart data={data}>
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
  );
}
