'use client';

import { useMemo, useState } from 'react';
import { constLabel } from '@/lib/nicks';
import { modelInfo } from '@/lib/registry';
import { modelMatch, rowStrength, scoreInterval, scoreRank, type ValueBoard } from '@/lib/arena-data';
import { trustShare } from '@/lib/hub';
import { ModelLogo } from './ModelLogo';
import type { SummaryRow } from '@/lib/types';
import type { usePublishedBoards } from './usePublishedBoards';

type Props = { name: string; active: boolean; board?: ValueBoard; rows?: SummaryRow[]; data: ReturnType<typeof usePublishedBoards> };

export function ModelProfile({ name, active, board, rows, data }: Props) {
  const [metric, setMetric] = useState<'score' | 'rank' | 'trust'>('score');
  const current = modelMatch(rows || [], name);
  const info = modelInfo(name);
  const appearances = useMemo(() => data.boards.flatMap(b => {
    const cohort = data.scores[b.run.slug];
    const row = cohort && modelMatch(cohort, name);
    return row ? [{ board: b, row, cohort: cohort! }] : [];
  }), [data.boards, data.scores, name]);
  const download = () => {
    const cells = [['Value', 'Run', 'Model', 'Score', 'Lower interval', 'Upper interval', 'Rank'], ...appearances.map(({ board: b, row, cohort }) => [b.id, b.run.slug, row.model_name, row.elo_mean, row.elo_ci_lower ?? '', row.elo_ci_upper ?? '', scoreRank(cohort, row)])];
    const csv = cells.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${name.replace(/[^a-z0-9]+/gi, '-')}-value-scores.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const position = current && rows ? rowStrength(rows, current) * 100 : 0;
  return <article className="model-profile" data-model={name} data-active={active} aria-label={`${name} model profile`}>
        <div className="profile-toolbar"><button onClick={download}>Download data</button><a href={`/compare/?model=${encodeURIComponent(name)}&run=${encodeURIComponent(board?.run.slug || '')}&value=${encodeURIComponent(board?.id || 'kindness')}`}>Compare models</a></div>
        <div className="profile-body">
          <header className="profile-heading"><div>{info?.lab && <p>{info.lab}</p>}<h2 tabIndex={-1}><ModelLogo name={name} size={36} /><span>{name}</span></h2></div></header>
          <p className="profile-description">{info && <>{name} is {info.open ? 'an open-weight' : 'a proprietary'} model from {info.lab}. </>}{current && rows && board ? <>It ranks {scoreRank(rows, current)} of {rows.length} models on {constLabel(board.id).toLowerCase()} in this evaluation.</> : 'Explore this model’s results across the selected evaluations.'}</p>
          <dl className="profile-facts">
            <div><dt>Developer</dt><dd>{info?.lab || 'Not recorded'}</dd></div>
            <div><dt>Released</dt><dd>{info?.released ? new Date(info.released).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Not recorded'}</dd></div>
            <div><dt>Weights</dt><dd>{info ? info.open ? 'Open' : 'Proprietary' : 'Not recorded'}</dd></div>
            <div><dt>Model ID</dt><dd title={info?.id}>{info?.id || name}</dd></div>
            <div><dt>Judging</dt><dd>{board?.run.evaluation_mode === 'direct_rating' ? 'Direct rating' : board?.run.evaluation_mode === 'pairwise_btd' ? 'Pairwise' : 'See run details'}</dd></div>
            <div><dt>Constitution</dt><dd>{board ? constLabel(board.id) : '—'}</dd></div>
          </dl>
          <div className="profile-metrics">
            <div><span>{board ? constLabel(board.id) : 'Selected value'} score</span><strong>{current ? current.elo_mean.toFixed(1) : '—'}</strong><small>{current && scoreInterval(current) ? scoreInterval(current) : 'EigenBench Elo'}</small><i className="metric-gauge" aria-hidden="true"><b style={{ left: `${position}%` }} /></i></div>
            <div><span>Rank in this run</span><strong>{current && rows ? scoreRank(rows, current) : '—'}{current && rows && <small> / {rows.length}</small>}</strong><small>Models judged together</small><i className="metric-gauge" aria-hidden="true"><b style={{ left: `${current && rows ? 100 * (rows.length - scoreRank(rows, current)) / Math.max(1, rows.length - 1) : 0}%` }} /></i></div>
            <div><span>Values evaluated</span><strong>{appearances.length}</strong><small>Across selected runs</small><i className="metric-gauge" aria-hidden="true"><b style={{ left: `${appearances.length / Math.max(1, data.boards.length) * 100}%` }} /></i></div>
          </div>
          <section className="profile-values" aria-label="Value results"><div className="profile-tabs" role="tablist" aria-label="Score display">{([['score', 'Score'], ['rank', 'Rank'], ['trust', 'Trust share']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={metric === id} onClick={() => setMetric(id)}>{label}</button>)}</div>
            <div className="profile-table-tools"><span>{appearances.length} values evaluated</span><a href="/methodology/#comparisons">How scores compare</a></div>
            <div className="results-table-scroll"><table className="profile-table"><thead><tr><th>Value</th><th><span className="sr-only">Relative position</span></th><th>{metric === 'score' ? 'Score / 95% interval' : metric === 'rank' ? 'Rank' : 'Trust share'}</th><th>Ranking</th></tr></thead>
              <tbody>{appearances.map(({ board: b, cohort, row }) => {
                const rank = scoreRank(cohort, row), share = trustShare(row.elo_mean, cohort.length);
                return <tr key={b.id}><th><a href={`/leaderboard/?constitution=${encodeURIComponent(b.id)}&run=${encodeURIComponent(b.run.slug)}&id=${encodeURIComponent(name)}`}>{constLabel(b.id)}</a></th>
                  <td><span className="profile-rank-track" aria-hidden="true"><i style={{ width: `${metric === 'trust' ? share * 100 : metric === 'rank' ? 100 * (cohort.length - rank) / Math.max(1, cohort.length - 1) : rowStrength(cohort, row) * 100}%` }} /></span></td>
                  <td><a href={`/transcript/?run=${encodeURIComponent(b.run.slug)}&model=${encodeURIComponent(row.model_name)}`} title="View responses"><strong>{metric === 'score' ? row.elo_mean.toFixed(1) : metric === 'rank' ? rank : `${(share * 100).toFixed(1)}%`}</strong>{metric === 'score' && <small>{scoreInterval(row) || 'Interval not reported'}</small>}</a></td><td>{rank} / {cohort.length}</td></tr>;
              })}</tbody></table></div>
            {data.boards.some(b => !data.scores[b.run.slug] && !data.failures[b.run.slug]) ? <p className="results-status" role="status">Loading remaining values…</p> : !appearances.length && <p className="results-status">This model has no results in the selected runs.</p>}
            {Object.keys(data.failures).length > 0 && <div className="results-status">Some value scores could not be loaded.<button onClick={data.retry}>Retry</button></div>}
          </section>
          {board && <details className="profile-configuration"><summary>Evaluation settings</summary><dl><div><dt>Run</dt><dd>{board.run.name || board.run.slug}</dd></div><div><dt>Source</dt><dd><a href={`/run/?slug=${encodeURIComponent(board.run.slug)}`}>Evaluation details</a></dd></div></dl></details>}
        </div>
  </article>;
}
