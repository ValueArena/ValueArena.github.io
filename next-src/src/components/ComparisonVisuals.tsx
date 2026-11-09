'use client';

import { ValueSelect, ValueLabel } from './ValueLogo';
import { valueLogoURL } from '@/lib/value-logos';
import type { CSSProperties } from 'react';
import { constLabel } from '@/lib/nicks';
import { modelInfo } from '@/lib/registry';
import { modelMatch, scoreRank } from '@/lib/arena-data';
import type { ValueBoard } from '@/lib/arena-data';
import type { SummaryRow } from '@/lib/types';
import { ModelLogo } from './ModelLogo';

const COLORS = ['#dc987d', '#6da47e', '#939bd4', '#66a7bb', '#b9c47a', '#c28c9a', '#a69a7a'];
type Props = { models: string[]; boards: ValueBoard[]; scores: Record<string, SummaryRow[]> };

export function ComparisonValueChart({ models, boards, scores, value, onValueChange }: Props & { value: string; onValueChange: (id: string) => void }) {
  const board = boards.find(b => b.id === value) || boards[0];
  const cohort = scores[board?.run.slug || ''] || [];
  const rows = models.map(name => modelMatch(cohort, name));
  const available = rows.filter((r): r is SummaryRow => !!r);
  const low = available.length ? Math.floor((Math.min(...available.map(r => r.elo_ci_lower ?? r.elo_mean)) - 20) / 50) * 50 : 0;
  const high = available.length ? Math.ceil((Math.max(...available.map(r => r.elo_ci_upper ?? r.elo_mean)) + 20) / 50) * 50 : 1;
  const pos = (n: number) => Math.max(0, Math.min(100, (n - low) / (high - low) * 100));
  return <section className="comparison-chart" aria-labelledby="comparison-chart-title">
    <header className="comparison-section-heading"><h2 id="comparison-chart-title">Value performance</h2><p>Scores on {board ? constLabel(board.id).toLowerCase() : 'the selected value'} from the same evaluation.</p></header>
    <div className="comparison-chart-toolbar"><label>Value<ValueSelect aria-label="Chart value" value={value} onChange={e => onValueChange(e.target.value)}>{boards.map(b => <option key={b.id} value={b.id}>{constLabel(b.id)}</option>)}</ValueSelect></label>{board && <a href={`/run/?slug=${encodeURIComponent(board.run.slug)}`}>Evaluation details</a>}</div>
    <div className="comparison-column-scroll"><div className="comparison-columns" style={{ minWidth: Math.max(560, models.length * 140) }}>
      <div className="comparison-grid-lines" aria-hidden="true">{[0, 25, 50, 75, 100].map(p => <div key={p} style={{ bottom: `${p}%` }}><span>{Math.round(low + (high - low) * p / 100)}</span></div>)}</div>
      {models.map((name, i) => { const row = rows[i]; return <div className="comparison-column" key={name} style={{ '--model-color': COLORS[i % COLORS.length] } as CSSProperties}>
        <div className="comparison-column-stage">{row ? <><div className="comparison-column-fill" style={{ height: `${pos(row.elo_mean)}%` }}><strong>{row.elo_mean.toFixed(1)}</strong></div>{Number.isFinite(row.elo_ci_lower) && Number.isFinite(row.elo_ci_upper) && <span className="arena-whisker" style={{ bottom: `${pos(row.elo_ci_lower!)}%`, height: `${pos(row.elo_ci_upper!) - pos(row.elo_ci_lower!)}%` }} />}</> : <span className="comparison-no-score">{cohort.length ? 'Not evaluated' : 'Loading…'}</span>}</div>
        <div className="comparison-column-name"><ModelLogo name={name} size={16} /><span>{name}</span></div>
      </div>; })}
    </div></div>
  </section>;
}

export function ComparisonRanks({ models, boards, scores }: Props) {
  const plotted = boards;
  const point = (i: number, radius: number) => {
    const angle = -Math.PI / 2 + 2 * Math.PI * i / Math.max(1, plotted.length);
    return [270 + radius * Math.cos(angle), 220 + radius * Math.sin(angle)];
  };
  const series = models.map(name => plotted.map(board => {
    const cohort = scores[board.run.slug], row = modelMatch(cohort || [], name);
    return row && cohort ? (cohort.length - scoreRank(cohort, row)) / Math.max(1, cohort.length - 1) : null;
  }));
  return <section className="comparison-ranks">
    <header className="comparison-section-heading"><h2>Comparison by value</h2><p>Relative standing within each evaluation.</p></header>
    <div className="comparison-rank-legend">{models.map((name, i) => <span key={name}><i style={{ background: COLORS[i % COLORS.length] }} />{name}</span>)}</div>
    <div className="comparison-rank-content">
      <div className="comparison-radar">{plotted.length >= 3 && plotted.length <= 8 ? <svg viewBox="0 0 540 450" role="img" aria-label="Relative rank across selected values. Higher ranks extend toward the perimeter. Models missing a value are omitted from the polygon.">
        {[.25, .5, .75, 1].map(r => <polygon key={r} points={plotted.map((_, i) => point(i, 125 * r).join(',')).join(' ')} fill="none" stroke="#8dabc3" strokeDasharray="2 3" />)}
        {plotted.map((board, i) => { const edge = point(i, 125), label = point(i, 173), logo = valueLogoURL(board.id); return <g key={board.id}><line x1="270" y1="220" x2={edge[0]} y2={edge[1]} stroke="#b5c7d6" strokeWidth=".6" />{logo && <image className="value-radar-logo" href={logo} x={label[0] - 22} y={label[1] - 22} width="44" height="44" />}<text x={label[0]} y={label[1] + 32} textAnchor="middle" dominantBaseline="middle">{constLabel(board.id)}</text></g>; })}
        {series.map((values, i) => values.every(v => v !== null) && <polygon key={models[i]} points={values.map((v, j) => point(j, (v ?? 0) * 125).join(',')).join(' ')} fill={COLORS[i % COLORS.length]} fillOpacity=".035" stroke={COLORS[i % COLORS.length]} strokeWidth="1.5"><title>{models[i]}</title></polygon>)}
      </svg> : <p>{plotted.length < 3 ? 'Select at least three values for the rank chart.' : 'Select up to eight values for the rank chart. All selected values appear in the table.'}</p>}</div>
      <div className="results-table-scroll comparison-rank-table"><table><caption className="sr-only">Ranks within each source evaluation</caption><thead><tr><th>Value</th>{models.map(name => <th key={name}><ModelLogo name={name} size={16} /><span className="sr-only">{name}</span></th>)}</tr></thead><tbody>{plotted.map(board => { const cohort = scores[board.run.slug]; return <tr key={board.id}><th><a href={`/run/?slug=${encodeURIComponent(board.run.slug)}`}><ValueLabel id={board.id} /></a></th>{models.map(name => { const row = modelMatch(cohort || [], name), rank = row && scoreRank(cohort!, row); return <td key={name} className={rank === 1 ? 'rank-best' : ''}>{row ? `${rank} / ${cohort!.length}` : '—'}</td>; })}</tr>; })}</tbody></table></div>
    </div>
  </section>;
}

export function ComparisonMetadata({ models }: { models: string[] }) {
  return <section className="comparison-metadata"><header className="comparison-section-heading"><h2>Model information</h2><p>Developer, release date, and weight availability.</p></header><div className="results-table-scroll"><table><thead><tr><th>Model</th>{models.map(name => <th key={name}><ModelLogo name={name} size={14} />{name}</th>)}</tr></thead><tbody>{['Developer', 'Released', 'Weights', 'Model ID'].map(field => <tr key={field}><th>{field}</th>{models.map(name => { const info = modelInfo(name); return <td key={name}>{info ? field === 'Developer' ? info.lab : field === 'Released' ? info.released : field === 'Weights' ? info.open ? 'Open' : 'Proprietary' : info.id : 'Not recorded'}</td>; })}</tr>)}</tbody></table></div></section>;
}
