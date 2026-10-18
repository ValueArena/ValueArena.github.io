'use client';

import { useEffect, useMemo, useState } from 'react';
import { Penguin } from '@/components/Penguin';
import { fetchIndex, fetchSummary } from '@/lib/hf';
import { agreement, baseName, boardName, formatRank, rankSpread, runningBest, spearman, trustShare } from '@/lib/hub';
import { ARENA_TEXT, FEATURED_GROUP, PLANNED_BASELINES, REASONING_KINDNESS, TREND_RUN, modelInfo } from '@/lib/registry';
import type { IndexRun, SummaryRow } from '@/lib/types';
import { BoardIcon, Delta, LogoTile, niceTicks } from './ui';
import { TrendsCard } from './TrendsCard';
import { ReasoningCard } from './ReasoningCard';
import { HowItWorks } from './HowItWorks';
import { BaselineScatter } from './BaselineScatter';

const BOARD_ORDER = ['kindness', 'conservatism', 'deep_ecology', 'taoism_constitution', 'marxism_constitution', 'lockean_rights_constitution'];
// A board is marked New for a month after its run.
const NEW_WITHIN_DAYS = 30;

export function LeaderboardHub() {
  const [runs, setRuns] = useState<IndexRun[] | null>(null);
  const [error, setError] = useState(false);
  const [board, setBoard] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, SummaryRow[]>>({});

  useEffect(() => {
    fetchIndex().then(index => setRuns(index.runs)).catch(() => setError(true));
  }, []);

  const boards = useMemo(() => {
    const featured = (runs || []).filter(run => run.group === FEATURED_GROUP && run.constitution);
    const order = (c: string) => {
      const i = BOARD_ORDER.indexOf(c.toLowerCase());
      return i < 0 ? BOARD_ORDER.length : i;
    };
    const now = Date.now();
    return featured
      .sort((a, b) => order(String(a.constitution)) - order(String(b.constitution)))
      .map(run => ({
        run,
        constitution: String(run.constitution),
        name: boardName(String(run.constitution)),
        isNew: now - (Date.parse(run.timestamp) || 0) < NEW_WITHIN_DAYS * 864e5,
      }));
  }, [runs]);

  const active = boards.find(b => b.run.slug === board) ?? boards[0];
  useEffect(() => {
    if (!active || rows[active.run.slug]) return;
    fetchSummary(active.run.slug)
      .then(summary => setRows(current => ({ ...current, [active.run.slug]: summary })))
      .catch(() => setRows(current => ({ ...current, [active.run.slug]: [] })));
  }, [active, rows]);

  if (error) return <div className="hollow">Couldn’t load the leaderboard index.</div>;
  if (!runs) return <div className="loading"><Penguin state="loading" /><span>Loading leaderboard</span></div>;
  if (!active) return null;
  const ranked = rows[active.run.slug];

  return (
    <div className="hub">
      <Highlights kindnessSlug={boards.find(b => b.constitution === 'kindness')?.run.slug} />

      <nav className="hub-boards" aria-label="Leaderboards">
        {boards.map(b => (
          <button key={b.run.slug} className="hub-board" aria-pressed={b === active} onClick={() => setBoard(b.run.slug)}>
            <BoardIcon constitution={b.constitution} />
            <span>{b.name}</span>
            {b.isNew && <span className="hub-new">New</span>}
          </button>
        ))}
      </nav>

      <section className="hub-card hub-card-board" aria-labelledby="hub-board-title">
        <header className="hub-card-head">
          <div>
            <p className="hub-eyebrow"><BoardIcon constitution={active.constitution} /> Leaderboard</p>
            <h2 id="hub-board-title" className="hub-title">{active.name}</h2>
            <p className="hub-sub">
              {String(active.run.models_count)} frontier models, scored by each other on 200 dilemmas · the same panel on every board ·{' '}
              <a href={`/run/?slug=${encodeURIComponent(active.run.slug)}`}>Run details</a>
            </p>
          </div>
        </header>
        {!ranked ? <div className="loading"><Penguin state="loading" size={32} /><span>Loading {active.name}</span></div>
          : ranked.length === 0 ? <div className="hollow">Couldn’t load this board.</div>
          : <>
            <Podium rows={ranked} />
            <RankTable rows={ranked} />
          </>}
      </section>

      <TrendsCard />

      <div className="hub-pair">
        <ReasoningCard />
        <BaselineScatter boardRows={ranked || []} boardName={active.name} />
      </div>

      <HowItWorks rows={ranked || []} boardName={active.name} />
    </div>
  );
}

/** Four headline numbers, each computed from a live run. Finds the kindness board itself if not given one. */
export function Highlights({ kindnessSlug }: { kindnessSlug?: string }) {
  const [data, setData] = useState<{ board?: SummaryRow[]; trend?: SummaryRow[]; reasoning?: SummaryRow[] }>({});
  useEffect(() => {
    const board = kindnessSlug ? Promise.resolve(kindnessSlug)
      : fetchIndex().then(index => index.runs.find(run => run.group === FEATURED_GROUP && run.constitution === 'kindness')?.slug);
    board.then(slug => (slug ? fetchSummary(slug) : null)).then(rows => { if (rows) setData(d => ({ ...d, board: rows })); }).catch(() => {});
    fetchSummary(TREND_RUN).then(trend => setData(d => ({ ...d, trend }))).catch(() => {});
    fetchSummary(REASONING_KINDNESS).then(reasoning => setData(d => ({ ...d, reasoning }))).catch(() => {});
  }, [kindnessSlug]);

  const top = data.board ? [...data.board].sort((a, b) => b.elo_mean - a.elo_mean)[0] : null;
  const gap = useMemo(() => {
    if (!data.trend) return null;
    const best = (open: boolean) => {
      const pts = data.trend!.flatMap(r => {
        const info = modelInfo(r.model_name);
        return info && info.open === open ? [{ name: r.model_name, date: info.released, score: r.elo_mean }] : [];
      });
      const steps = runningBest(pts);
      return steps[steps.length - 1];
    };
    const closed = best(false), open = best(true);
    return closed && open ? { closed, open, gap: closed.score - open.score } : null;
  }, [data.trend]);
  const shift = useMemo(() => {
    if (!data.reasoning) return null;
    const by = new Map<string, Record<string, number>>();
    for (const r of data.reasoning) {
      const mode = /\(reasoning\)$/.test(r.model_name) ? 'reasoning' : /\(instant\)$/.test(r.model_name) ? 'instant' : null;
      if (!mode) continue;
      by.set(baseName(r.model_name), { ...(by.get(baseName(r.model_name)) || {}), [mode]: r.elo_mean });
    }
    return [...by].filter(([, v]) => v.reasoning != null && v.instant != null)
      .map(([name, v]) => ({ name, delta: v.reasoning - v.instant }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] ?? null;
  }, [data.reasoning]);
  const rho = useMemo(() => {
    if (!data.trend) return null;
    const pairs = data.trend.flatMap(r => (ARENA_TEXT.rows[r.model_name] ? [[ARENA_TEXT.rows[r.model_name].score, r.elo_mean]] : []));
    const value = spearman(pairs.map(p => p[0]), pairs.map(p => p[1]));
    return value == null ? null : { value, n: pairs.length };
  }, [data.trend]);

  return (
    <section className="hub-highlights" aria-label="Highlights">
      <article className="hub-stat-tile">
        <p className="hub-stat-label">Kindest frontier model</p>
        {top ? <>
          <p className="hub-stat-value"><LogoTile name={top.model_name} size={26} />{top.model_name}</p>
          <p className="hub-stat-sub">{top.elo_mean.toFixed(0)} · {(trustShare(top.elo_mean, data.board!.length) * data.board!.length).toFixed(1)}× a fair share of judges’ trust</p>
        </> : <p className="hub-stat-sub">Loading…</p>}
      </article>
      <article className="hub-stat-tile">
        <p className="hub-stat-label">Proprietary lead on kindness</p>
        {gap ? <>
          <p className="hub-stat-value">{gap.gap >= 0 ? '+' : '−'}{Math.abs(gap.gap).toFixed(0)}</p>
          <p className="hub-stat-sub">{gap.closed.name} over {gap.open.name}, the best open-weights model</p>
        </> : <p className="hub-stat-sub">Loading…</p>}
      </article>
      <article className="hub-stat-tile">
        <p className="hub-stat-label">Biggest shift from reasoning</p>
        {shift ? <>
          <p className="hub-stat-value"><LogoTile name={`${shift.name} (reasoning)`} size={26} />{shift.name} <Delta value={shift.delta} /></p>
          <p className="hub-stat-sub">Kindness with reasoning on vs. off, same judges</p>
        </> : <p className="hub-stat-sub">Loading…</p>}
      </article>
      <article className="hub-stat-tile">
        <p className="hub-stat-label">Agreement with Arena</p>
        {rho ? <>
          <p className="hub-stat-value">ρ {rho.value.toFixed(2)}</p>
          <p className="hub-stat-sub">{agreement(rho.value)} across {rho.n} models: kindness is not the same as being liked</p>
        </> : <p className="hub-stat-sub">Loading…</p>}
      </article>
    </section>
  );
}

export function Podium({ rows }: { rows: SummaryRow[] }) {
  const sorted = [...rows].sort((a, b) => b.elo_mean - a.elo_mean).slice(0, 3);
  const spread = rankSpread(rows);
  return (
    <ol className="hub-podium" aria-label="Top three">
      {sorted.map((row, i) => {
        const info = modelInfo(row.model_name);
        const half = row.elo_ci_lower != null && row.elo_ci_upper != null ? (row.elo_ci_upper - row.elo_ci_lower) / 2 : null;
        return (
          <li key={row.model_name} className="hub-podium-item" data-place={i + 1}>
            <span className="hub-podium-rank">{formatRank(spread.get(row.model_name)!)}</span>
            <LogoTile name={row.model_name} size={36} />
            <span className="hub-podium-name">{row.model_name}</span>
            <span className="hub-podium-meta">{info ? `${info.lab} · ${info.open ? 'Open weights' : 'Proprietary'}` : 'Model'}</span>
            <span className="hub-podium-score">{row.elo_mean.toFixed(0)}{half != null && <small> ±{half.toFixed(0)}</small>}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Info({ text }: { text: string }) {
  return (
    <span className="hub-info" title={text} aria-label={text} role="img">
      <svg viewBox="0 0 16 16" width={12} height={12} aria-hidden="true"><circle cx="8" cy="8" r="6.5" /><path d="M8 7.2v4M8 4.8v.1" /></svg>
    </span>
  );
}

/** Ranks from every row; `limit` shows only the top rows, `baselines` adds the Arena and planned columns. */
export function RankTable({ rows, limit, baselines = true, href }: { rows: SummaryRow[]; limit?: number; baselines?: boolean; href?: (model: string) => string }) {
  const spread = rankSpread(rows);
  const sorted = [...rows].sort((a, b) => b.elo_mean - a.elo_mean).slice(0, limit ?? rows.length);
  const lo = Math.min(1500, ...sorted.map(r => r.elo_ci_lower ?? r.elo_mean));
  const hi = Math.max(1500, ...sorted.map(r => r.elo_ci_upper ?? r.elo_mean));
  const ticks = niceTicks(lo, hi, 4);
  const d0 = Math.min(lo, ticks[0]), d1 = Math.max(hi, ticks[ticks.length - 1]);
  const x = (v: number) => ((v - d0) / (d1 - d0)) * 100;

  return (
    <div className="hub-table-wrap">
      <table className="hub-table hub-rank-table">
        <thead>
          <tr>
            <th scope="col">Rank <Info text="Models whose 95% intervals overlap share a rank range, e.g. 2–4." /></th>
            <th scope="col">Model</th>
            <th scope="col" className="num">Score <Info text="EigenBench score ± half the 95% interval. 1500 is a fair share of the judges’ trust." /></th>
            <th scope="col" className="hub-col-bar">
              <div className="hub-scale" aria-hidden="true">
                {ticks.map(t => <span key={t} style={{ left: `${x(t)}%` }}>{t}</span>)}
              </div>
              <span className="sr-only">95% interval</span>
            </th>
            {baselines && <th scope="col" className="num hub-col-baseline">
              Arena <Info text={`${ARENA_TEXT.metric}, published ${ARENA_TEXT.published}. ≈ marks a different effort setting of the same model. ${ARENA_TEXT.license}, ${ARENA_TEXT.attribution}.`} />
            </th>}
            {baselines && PLANNED_BASELINES.map(b => (
              <th key={b.id} scope="col" className="num hub-col-planned">{b.name} <Info text={`${b.what} Not yet collected for these models.`} /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => {
            const info = modelInfo(row.model_name);
            const arena = ARENA_TEXT.rows[row.model_name];
            const ciLo = row.elo_ci_lower, ciHi = row.elo_ci_upper;
            const half = ciLo != null && ciHi != null ? (ciHi - ciLo) / 2 : null;
            return (
              <tr key={row.model_name}>
                <td className="hub-rank"><span>{formatRank(spread.get(row.model_name)!)}</span></td>
                <td>
                  <a className="hub-model" href={href ? href(row.model_name) : `/model/?id=${encodeURIComponent(row.model_name)}`}>
                    <LogoTile name={row.model_name} size={28} />
                    <span>
                      <span className="hub-model-name">{row.model_name}</span>
                      {info && <span className="hub-model-meta">{info.lab} · {info.open ? 'Open weights' : 'Proprietary'}</span>}
                    </span>
                  </a>
                </td>
                <td className="num hub-score">
                  {row.elo_mean.toFixed(0)}{half != null && <span className="hub-pm"> ±{half.toFixed(0)}</span>}
                </td>
                <td className="hub-col-bar">
                  <div className="hub-forest" aria-hidden="true">
                    {ticks.map(t => <span key={t} className="hub-forest-grid" style={{ left: `${x(t)}%` }} />)}
                    <span className="hub-forest-ref" style={{ left: `${x(1500)}%` }} />
                    {ciLo != null && ciHi != null && <span className="hub-forest-ci" style={{ left: `${x(ciLo)}%`, width: `${x(ciHi) - x(ciLo)}%` }} />}
                    <span className="hub-forest-dot" style={{ left: `${x(row.elo_mean)}%` }} />
                  </div>
                </td>
                {baselines && <td className="num hub-col-baseline">
                  {arena
                    ? <span title={`${arena.arena_model} · ${arena.votes.toLocaleString()} votes`}>{arena.score.toFixed(0)}{!arena.exact && <sup className="hub-approx">≈</sup>}</span>
                    : <span className="hub-na" title="Arena doesn’t list this model">—</span>}
                </td>}
                {baselines && PLANNED_BASELINES.map(b => <td key={b.id} className="num hub-col-planned"><span className="hub-soon">Soon</span></td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hub-foot">
        <span className="hub-key-ref" /> 1500 is a fair share of the judges’ trust; bars are 95% intervals.
        {baselines && <> ≈ Arena lists another effort setting.
          Arena scores: {ARENA_TEXT.attribution}, <a href={ARENA_TEXT.source}>leaderboard dataset</a> ({ARENA_TEXT.license}), {ARENA_TEXT.published}.</>}
      </p>
    </div>
  );
}
