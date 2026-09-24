'use client';

import { useEffect, useState } from 'react';
import { Penguin } from './Penguin';
import { ModelLogo } from './ModelLogo';
import { fetchIndex, fetchSummary } from '@/lib/hf';
import { normConst, constLabel } from '@/lib/nicks';
import { extent, interval, validRows } from '@/lib/chart-data';
import type { IndexRun, SummaryRow } from '@/lib/types';

export function HomeRanking() {
  const [trait, setTrait] = useState('kindness');
  const [data, setData] = useState<{ trait: string; run: IndexRun; rows: SummaryRow[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setError(''); setData(null);
    fetchIndex().then(async index => {
      const run = [...(index.runs || [])].filter(r => normConst(r.constitution) === trait && !/deprecated/i.test(`${r.name} ${r.note}`)).sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))[0];
      if (!run) throw new Error('No published run available for this constitution.');
      const rows = validRows(await fetchSummary(run.slug)).sort((a, b) => b.elo_mean - a.elo_mean);
      if (!cancelled) setData({ trait, run, rows });
    }).catch(() => { if (!cancelled) setError('This ranking could not be loaded. You can browse published runs in the explorer.'); });
    return () => { cancelled = true; };
  }, [trait]);
  const current = data?.trait === trait ? data : null;
  const rows = current?.rows.slice(0, 7) || [];
  const domain = extent(rows);
  const x = (v: number) => 20 + (v - domain[0]) / (domain[1] - domain[0]) * 560;
  const ticks = Array.from({ length: 4 }, (_, i) => domain[0] + (domain[1] - domain[0]) * i / 3);
  return <div className="home-ranking">
    <div className="home-plot-controls" role="group" aria-label="Ranking constitution">{['kindness', 'humor', 'goodness'].map(c => <button key={c} aria-pressed={trait === c} onClick={() => setTrait(c)}>{constLabel(c)}</button>)}</div>
    {error ? <p className="chart-message" role="status">{error} <a href="/explore/">Explore →</a></p> : !current ? <p className="chart-message chart-loading" role="status"><Penguin size={36} state="loading" /><span>Loading published ranking…</span></p> : !rows.length ? <p className="chart-message">No scores are available in this run.</p> : <div className="home-dotplot">
      <header><strong>{constLabel(trait)}</strong><span>Top {rows.length} of {current.rows.length} models · Latest published run</span></header>
      <div className="ranking-figure" key={current.run.slug} aria-label={`${constLabel(trait)} ranking`}>
        <div className="ranking-axis"><span>Model</span><div className="ranking-ticks" aria-hidden="true">{ticks.map(t => <span key={t} style={{ left: `${x(t) / 6}%` }}>{Math.round(t)}</span>)}</div><span>Elo</span></div>
        {rows.map(row => { const ci = interval(row); return <a key={row.model_name} className="ranking-row" href={`/transcript/?run=${encodeURIComponent(current.run.slug)}&model=${encodeURIComponent(row.model_name)}`} aria-label={`${row.model_name}: Elo ${row.elo_mean.toFixed(1)}${ci ? `, 95% interval ${ci[0].toFixed(1)} to ${ci[1].toFixed(1)}` : ', interval unavailable'}. Read judgments.`}>
          <span className="ranking-name"><ModelLogo name={row.model_name} size={22} />{row.model_name}</span>
          <svg viewBox="0 0 600 36" preserveAspectRatio="none" aria-hidden="true">{ticks.map(t => <line key={t} x1={x(t)} x2={x(t)} y1="0" y2="36" className="chart-grid" />)}{ci && <line x1={x(ci[0])} x2={x(ci[1])} y1="18" y2="18" stroke="var(--accent)" strokeWidth="2" />}<circle cx={x(row.elo_mean)} cy="18" r="1" fill="var(--accent)" stroke="var(--accent)" strokeWidth="5" vectorEffect="non-scaling-stroke" /></svg>
          <span className="ranking-score">{row.elo_mean.toFixed(1)}</span>
        </a>; })}
      </div>
      <p className="home-plot-caption">Dots are mean Elo and lines are 95% intervals, where the run published them. Each constitution may have a different set of models. Click a model to read its judgments.</p>
      <div className="home-plot-source"><a href={`/run/?slug=${encodeURIComponent(current.run.slug)}`}>Run & coverage: {current.run.name || current.run.slug} ↗</a><a href={`/explore/?view=ranking&x=${encodeURIComponent(current.run.slug)}`}>See all {current.rows.length} models →</a></div>
    </div>}
  </div>;
}
