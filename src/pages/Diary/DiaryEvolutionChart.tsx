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
//
// Cores do guia da clínica: o traço e os pontos no verde escuro (`teal-deep`,
// o verde de traço), a área no verde da marca bem diluído e a grade na cor
// das divisórias. Textos com 13 px, o menor tamanho do guia.
export default function DiaryEvolutionChart({ data }: DiaryEvolutionChartProps) {
  return (
    <ResponsiveContainer width="100%" height={170}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="evolucaoGradiente" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="dateLabel"
          tick={{ fontSize: 13, fill: 'var(--color-muted-foreground)' }}
          axisLine={false}
          tickLine={false}
        />
        {/* `interval={0}`: os seis graus sempre à vista. Sem ele o Recharts
            julgava que os números se tocavam e escondia um deles — o 4, o
            grau de atenção. Com 26 px entre os graus, os rótulos de 13 px
            cabem sem encostar. */}
        <YAxis
          domain={[0, 5]}
          ticks={[0, 1, 2, 3, 4, 5]}
          interval={0}
          tick={{ fontSize: 13, fill: 'var(--color-muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          width={24}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--color-popover)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: 13,
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          name="Intensidade"
          stroke="var(--color-primary-deep)"
          strokeWidth={2}
          fill="url(#evolucaoGradiente)"
          dot={{ r: 3, fill: 'var(--color-primary-deep)' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
