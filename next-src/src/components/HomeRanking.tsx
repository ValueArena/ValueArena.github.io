'use client';

import { useEffect, useState } from 'react';
import { Penguin } from './Penguin';
import { fetchIndex, fetchSummary } from '@/lib/hf';
import { normConst, constLabel } from '@/lib/nicks';
import { validRows } from '@/lib/chart-data';
import { Podium, RankTable } from './hub/LeaderboardHub';
import { BoardIcon } from './hub/ui';
import type { IndexRun, SummaryRow } from '@/lib/types';

const TRAITS = ['kindness', 'humor', 'goodness'];
// The table shows this many models; ranks still count every model in the run.
const SHOWN = 7;

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

  return <div className="home-ranking hub hub-embed">
    <nav className="hub-boards" aria-label="Ranking constitution">
      {TRAITS.map(c => <button key={c} className="hub-board" aria-pressed={trait === c} onClick={() => setTrait(c)}><BoardIcon constitution={c} /><span>{constLabel(c)}</span></button>)}
    </nav>
    {error ? <p className="chart-message" role="status">{error} <a href="/explore/">Explore →</a></p>
      : !current ? <p className="chart-message chart-loading" role="status"><Penguin size={36} state="loading" /><span>Loading published ranking…</span></p>
      : !current.rows.length ? <p className="chart-message">No scores are available in this run.</p>
      : <div className="hub-home-board" key={current.run.slug}>
        <header className="hub-card-head">
          <div>
            <p className="hub-eyebrow"><BoardIcon constitution={trait} /> Latest published run</p>
            <h3 className="hub-title">{constLabel(trait)}</h3>
            <p className="hub-sub">Top {Math.min(SHOWN, current.rows.length)} of {current.rows.length} models · {current.run.name || current.run.slug}</p>
          </div>
        </header>
        <Podium rows={current.rows} />
        <RankTable rows={current.rows} limit={SHOWN} baselines={false}
          href={model => `/transcript/?run=${encodeURIComponent(current.run.slug)}&model=${encodeURIComponent(model)}`} />
        <div className="home-plot-source"><a href={`/run/?slug=${encodeURIComponent(current.run.slug)}`}>Run & coverage ↗</a><a href={`/explore/?view=ranking&x=${encodeURIComponent(current.run.slug)}`}>See all {current.rows.length} models →</a></div>
      </div>}
  </div>;
}
