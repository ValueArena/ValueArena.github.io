'use client';

import { useEffect, useMemo, useState } from 'react';
import { Penguin } from '@/components/Penguin';
import { fetchIndex, fetchSummary } from '@/lib/hf';
import { baseName, boardName } from '@/lib/hub';
import { REASONING_GROUP, modelInfo } from '@/lib/registry';
import type { IndexRun, SummaryRow } from '@/lib/types';
import { Delta, LogoTile, niceTicks } from './ui';

interface Pair { name: string; instant: number; reasoning: number; delta: number }

// Each run judges the same models twice, with reasoning on and off, on one constitution.
export function ReasoningCard() {
  const [runs, setRuns] = useState<IndexRun[] | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, SummaryRow[]>>({});

  useEffect(() => {
    fetchIndex().then(index => setRuns(index.runs.filter(run => run.group === REASONING_GROUP)
      .sort((a, b) => String(a.constitution).localeCompare(String(b.constitution))))).catch(() => setRuns([]));
  }, []);
  const active = runs?.find(run => run.slug === slug) ?? runs?.find(run => run.constitution === 'kindness') ?? runs?.[0];
  useEffect(() => {
    if (!active || rows[active.slug]) return;
    fetchSummary(active.slug).then(s => setRows(r => ({ ...r, [active.slug]: s }))).catch(() => setRows(r => ({ ...r, [active.slug]: [] })));
  }, [active, rows]);

  const pairs = useMemo<Pair[]>(() => {
    const summary = active ? rows[active.slug] || [] : [];
    const byModel = new Map<string, { instant?: number; reasoning?: number }>();
    for (const row of summary) {
      const mode = modelInfo(row.model_name)?.mode ?? (/\(reasoning\)$/.test(row.model_name) ? 'reasoning' : /\(instant\)$/.test(row.model_name) ? 'instant' : null);
      if (!mode) continue;
      const entry = byModel.get(baseName(row.model_name)) ?? {};
      entry[mode] = row.elo_mean;
      byModel.set(baseName(row.model_name), entry);
    }
    return [...byModel].filter(([, v]) => v.instant != null && v.reasoning != null)
      .map(([name, v]) => ({ name, instant: v.instant!, reasoning: v.reasoning!, delta: v.reasoning! - v.instant! }))
      .sort((a, b) => b.delta - a.delta);
  }, [active, rows]);

  if (runs && runs.length === 0) return null;
  const loading = !runs || !active || !rows[active.slug];
  const all = pairs.flatMap(p => [p.instant, p.reasoning]);
  const ticks = all.length ? niceTicks(Math.min(...all) - 10, Math.max(...all) + 10, 4) : [];
  const d0 = all.length ? Math.min(ticks[0], Math.min(...all) - 10) : 0;
  const d1 = all.length ? Math.max(ticks[ticks.length - 1], Math.max(...all) + 10) : 1;
  const x = (v: number) => ((v - d0) / (d1 - d0)) * 100;
  const up = pairs.filter(p => Math.round(p.delta) > 0).length;
  const median = pairs.length ? [...pairs].sort((a, b) => a.delta - b.delta)[Math.floor(pairs.length / 2)].delta : 0;
  const constitution = active ? boardName(String(active.constitution)) : '';

  return (
    <section className="hub-card" aria-labelledby="hub-reasoning-title">
      <header className="hub-card-head">
        <div>
          <p className="hub-eyebrow">Reasoning</p>
          <h2 id="hub-reasoning-title" className="hub-title">Does thinking change values?</h2>
          <p className="hub-sub">The same models with reasoning on and off, judged in one run</p>
        </div>
        {runs && runs.length > 1 && (
          <div className="hub-tabs" role="tablist" aria-label="Constitution">
            {runs.map(run => (
              <button key={run.slug} role="tab" aria-selected={run === active} onClick={() => setSlug(run.slug)}>{boardName(String(run.constitution))}</button>
            ))}
          </div>
        )}
      </header>

      {loading ? <div className="loading"><Penguin state="loading" size={32} /><span>Loading</span></div> : pairs.length === 0 ? <div className="hollow">No paired models in this run.</div> : <>
        <div className="hub-mini-stats">
          <div><strong>{up}<span> of {pairs.length}</span></strong><span>score higher with reasoning</span></div>
          <div><strong>{Math.round(median) === 0 ? '0' : `${median > 0 ? '+' : '−'}${Math.abs(median).toFixed(0)}`}</strong><span>median change</span></div>
        </div>

        <div className="hub-db" role="list" aria-label={`${constitution} scores with reasoning on and off`}>
          <div className="hub-db-axis" aria-hidden="true">
            <span />
            <div className="hub-db-scale">{ticks.map(t => <span key={t} style={{ left: `${x(t)}%` }}>{t}</span>)}</div>
            <span className="hub-db-axis-delta">Change</span>
          </div>
          {pairs.map(p => {
            const from = x(p.instant), to = x(p.reasoning);
            return (
              <div key={p.name} className="hub-db-row" role="listitem" tabIndex={0}
                aria-label={`${p.name}: instant ${p.instant.toFixed(0)}, reasoning ${p.reasoning.toFixed(0)}`}>
                <span className="hub-db-name"><LogoTile name={`${p.name} (reasoning)`} size={26} /><span>{p.name}</span></span>
                <span className="hub-db-track">
                  {ticks.map(t => <span key={t} className="hub-db-grid" style={{ left: `${x(t)}%` }} />)}
                  <span className="hub-db-link" data-dir={to >= from ? 'up' : 'down'}
                    style={{ left: `${Math.min(from, to)}%`, width: `${Math.abs(to - from)}%` }} />
                  <span className="hub-db-dot hub-db-instant" style={{ left: `${from}%` }} />
                  <span className="hub-db-dot hub-db-reasoning" style={{ left: `${to}%` }} />
                  <span className="hub-db-tip" style={{ left: `${Math.max(from, to)}%` }}>
                    <span><i className="hub-key hub-key-instant" />Instant <strong>{p.instant.toFixed(0)}</strong></span>
                    <span><i className="hub-key hub-key-reasoning" />Reasoning <strong>{p.reasoning.toFixed(0)}</strong></span>
                  </span>
                </span>
                <Delta value={p.delta} />
              </div>
            );
          })}
        </div>

        <ul className="hub-legend">
          <li><i className="hub-key hub-key-instant" /> Instant</li>
          <li><i className="hub-key hub-key-reasoning" /> Reasoning</li>
          <li className="hub-legend-note">Sorted by change · {constitution} score</li>
        </ul>
        <details className="hub-details">
          <summary>Show as a table</summary>
          <table className="hub-table hub-table-compact">
            <thead><tr><th scope="col">Model</th><th scope="col" className="num">Instant</th><th scope="col" className="num">Reasoning</th><th scope="col" className="num">Change</th></tr></thead>
            <tbody>
              {pairs.map(p => (
                <tr key={p.name}><td>{p.name}</td><td className="num">{p.instant.toFixed(0)}</td><td className="num">{p.reasoning.toFixed(0)}</td><td className="num">{p.delta >= 0 ? '+' : '−'}{Math.abs(p.delta).toFixed(0)}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      </>}
    </section>
  );
}
