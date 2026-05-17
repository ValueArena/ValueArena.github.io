'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface Props {
  eigentrust: number[];
  modelNames: string[];
}

export function TrustChart({ eigentrust, modelNames }: Props) {
  const paired = modelNames
    .map((n, i) => ({ name: n, trust: eigentrust[i] ?? 0 }))
    .sort((a, b) => a.trust - b.trust);
  if (!paired.length) return null;
  const maxTrust = Math.max(...paired.map((p) => p.trust));

  // Color ramp: muted blue-gray → warm amber as trust grows.
  const colorOf = (t: number) => {
    const ratio = maxTrust > 0 ? t / maxTrust : 0;
    const r = Math.round(100 + ratio * 132);
    const g = Math.round(116 + ratio * 48);
    const b = Math.round(139 - ratio * 65);
    return `rgb(${r},${g},${b})`;
  };

  return (
    <ResponsiveContainer width="100%" height={Math.max(240, paired.length * 28)}>
      <BarChart data={paired} layout="vertical" margin={{ top: 12, right: 36, left: 12, bottom: 12 }}>
        <CartesianGrid horizontal={false} stroke="var(--border-light)" />
        <XAxis
          type="number"
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
          formatter={(value: number) => [value.toFixed(4), 'Trust']}
        />
        <Bar dataKey="trust" radius={[0, 3, 3, 0]} isAnimationActive={false}>
          {paired.map((p, idx) => (
            <Cell key={`c-${idx}`} fill={colorOf(p.trust)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
