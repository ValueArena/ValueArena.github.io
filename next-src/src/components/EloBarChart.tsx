'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { detectLab, labColor } from '@/lib/labs';
import type { Summary } from '@/lib/types';

interface Props {
  summary: Summary;
}

interface Datum {
  name: string;
  lab: string;
  elo: number;
  ci_low: number | undefined;
  ci_high: number | undefined;
  color: string;
  /* For recharts ErrorBar: [low_offset, high_offset] in same units as `elo`. */
  err: [number, number];
}

export function EloBarChart({ summary }: Props) {
  const data: Datum[] = [...summary]
    .filter((s) => typeof s.elo_mean === 'number')
    .sort((a, b) => b.elo_mean - a.elo_mean)
    .map((s) => {
      const lab = detectLab(s.model_name);
      const lo = s.elo_ci_lower;
      const hi = s.elo_ci_upper;
      return {
        name: s.model_name,
        lab,
        elo: s.elo_mean,
        ci_low: lo,
        ci_high: hi,
        color: labColor(s.model_name),
        err: [lo != null ? s.elo_mean - lo : 0, hi != null ? hi - s.elo_mean : 0] as [number, number],
      };
    });

  if (!data.length) return null;
  const xMin = Math.min(...data.map((d) => d.ci_low ?? d.elo)) - 12;
  const xMax = Math.max(...data.map((d) => d.ci_high ?? d.elo)) + 12;

  return (
    <ResponsiveContainer width="100%" height={Math.max(240, data.length * 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 12, right: 60, left: 12, bottom: 12 }}>
        <CartesianGrid horizontal={false} stroke="var(--border-light)" />
        <XAxis
          type="number"
          domain={[xMin, xMax]}
          tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
          stroke="var(--border)"
        />
        <YAxis
          type="category"
          dataKey="name"
          width={190}
          tick={{ fill: 'var(--text)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
          stroke="var(--border)"
          interval={0}
        />
        <Tooltip
          cursor={{ fill: 'var(--bg-hover)' }}
          contentStyle={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text)',
            fontSize: 12,
            padding: '6px 10px',
            boxShadow: 'var(--shadow-lg)',
          }}
          itemStyle={{ color: 'var(--text)' }}
          labelStyle={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 2 }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: number, _name: string, item: any) => {
            const p = item?.payload as Datum | undefined;
            if (!p) return [`${value.toFixed(1)}`, 'Elo'];
            const ci =
              p.ci_low != null && p.ci_high != null
                ? ` (CI ${p.ci_low.toFixed(0)}–${p.ci_high.toFixed(0)})`
                : '';
            return [`${value.toFixed(1)}${ci} · ${p.lab}`, 'Elo'];
          }}
          labelFormatter={(label: string) => label}
        />
        <Bar dataKey="elo" radius={[0, 3, 3, 0]} isAnimationActive={false}>
          {data.map((d, idx) => (
            <Cell key={`c-${idx}`} fill={d.color} />
          ))}
          <ErrorBar
            dataKey="err"
            direction="x"
            width={5}
            stroke="var(--text-muted)"
            strokeWidth={1}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
