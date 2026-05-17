'use client';

import { useEffect, useState } from 'react';
import { REF_ANCHOR, REF_NICKS } from '@/lib/config';
import { fetchIndex, fetchMeta, fetchSummary } from '@/lib/hf';
import { constLabel, normConst } from '@/lib/nicks';
import { CONSTITUTIONS_DATA } from '@/lib/constitutions-data';
import { CONSTITUTION_TAGLINES } from '@/lib/taglines';
import type { IndexRun, MetaJson, Summary } from '@/lib/types';
import { ModelLogo } from '@/components/ModelLogo';
import { Sparkbar } from '@/components/Sparkbar';
import { Penguin } from '@/components/Penguin';

interface RunData {
  run: IndexRun;
  meta: MetaJson;
  summary: Summary;
}

type State =
  | { status: 'loading' }
  | { status: 'no-id' }
  | { status: 'error'; message: string }
  | { status: 'ok'; id: string; runs: RunData[] };

export default function ConstitutionPage() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const id = normConst((params.get('id') || '').replace(/ /g, '+'));
      if (!id) {
        if (!cancelled) setState({ status: 'no-id' });
        return;
      }
      try {
        const index = await fetchIndex();
        const runs = (index.runs || [])
          .filter((r) => normConst(r.constitution) === id)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const fetched = await Promise.all(
          runs.map(async (r) => {
            try {
              const [meta, summary] = await Promise.all([fetchMeta(r.slug), fetchSummary(r.slug)]);
              return { run: r, meta, summary };
            } catch {
              return null;
            }
          })
        );
        if (!cancelled) setState({ status: 'ok', id, runs: fetched.filter(Boolean) as RunData[] });
      } catch (e) {
        if (!cancelled)
          setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state.status === 'ok') {
      document.title = `ValueArena — ${constLabel(state.id)}`;
    }
  }, [state]);

  if (state.status === 'loading') return <div className="loading"><Penguin state="loading" /><span>Loading constitution</span></div>;
  if (state.status === 'no-id')
    return (
      <div className="error">
        No constitution specified. <a href="/">Back</a>
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="error">
        Failed to load: {state.message} <br />
        <a href="/">Back</a>
      </div>
    );

  const label = constLabel(state.id);
  const tagline = CONSTITUTION_TAGLINES[state.id] || 'A value dimension evaluated across multiple models.';
  const criteria = CONSTITUTIONS_DATA[state.id] || [];

  // Most-recent appearance per model nick across all runs for this constitution.
  const byNick = new Map<
    string,
    { nick: string; elo: number; ci_low?: number; ci_high?: number; type: string; run: IndexRun }
  >();
  for (const { run, meta, summary } of state.runs) {
    for (const s of summary) {
      if (byNick.has(s.model_name)) continue;
      byNick.set(s.model_name, {
        nick: s.model_name,
        elo: s.elo_mean,
        ci_low: s.elo_ci_lower,
        ci_high: s.elo_ci_upper,
        type: (meta.models?.[s.model_name]?.type as string) || 'api',
        run,
      });
    }
  }
  const rows = [...byNick.values()]
    .filter((r) => typeof r.elo === 'number')
    .sort((a, b) => b.elo - a.elo);

  return (
    <>
      <div className="breadcrumb">
        <a href="/">ValueArena</a> / <span>{label}</span>
      </div>

      <div className="specimen-hero">
        <div className="specimen-hero-inner">
          <div className="specimen-sigil">{label.charAt(0).toUpperCase()}</div>
          <div>
            <div className="specimen-kicker">Constitution</div>
            <div className="specimen-title">{label}</div>
            <div className="specimen-sub">{tagline}</div>
          </div>
          <div className="specimen-stats">
            <div className="specimen-stat-label">Criteria</div>
            <div className="specimen-stat-value">{criteria.length || '—'}</div>
            <div className="specimen-stat-sub">
              {state.runs.length} run{state.runs.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Criteria</h2>
        <div className="card-caption">
          Each criterion names a preference the judge applies when comparing two responses. Articles
          are ranked by position, not importance — the full list is the instruction.
        </div>
        {criteria.length ? (
          <div className="scripture">
            {criteria.map((text, i) => (
              <div key={i} className="criterion-article">
                <div className="criterion-numeral">{String(i + 1).padStart(2, '0')}</div>
                <div className="criterion-text">{text}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="hollow">No criteria text available for this constitution.</div>
        )}
      </div>

      <div className="card">
        <h2>Leaderboard</h2>
        <div className="card-caption">
          Latest bootstrapped Elo for every model evaluated under <strong>{label}</strong>, anchored
          so reference models (gpt-4o, claude-4-sonnet, gemini-2.5-pro) average {REF_ANCHOR}.
        </div>
        {rows.length ? (
          <table className="elo-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Model</th>
                <th>Type</th>
                <th>Source run</th>
                <th className="mono-cell">Elo</th>
                <th>Δ from {REF_ANCHOR}</th>
                <th className="mono-cell">95% CI</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isRef = REF_NICKS.has(r.nick.toLowerCase());
                const ci =
                  r.ci_low && r.ci_high
                    ? `${r.ci_low.toFixed(0)} — ${r.ci_high.toFixed(0)}`
                    : '—';
                return (
                  <tr key={r.nick}>
                    <td className="mono-cell">{i + 1}</td>
                    <td>
                      <ModelLogo name={r.nick} size={14} className="mr-1.5" />
                      <a className="link-subtle" href={`/model/?id=${encodeURIComponent(r.nick)}`}>
                        {r.nick}
                      </a>
                      {isRef ? (
                        <span
                          className="tag tag-sm"
                          style={{ marginLeft: 6, color: 'var(--accent)', borderColor: 'var(--accent)' }}
                        >
                          ref
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <span className={`tag tag-${r.type}`}>{r.type}</span>
                    </td>
                    <td>
                      <a className="link-subtle" href={`/run/?slug=${encodeURIComponent(r.run.slug)}`}>
                        {r.run.name || r.run.slug}
                      </a>
                    </td>
                    <td className="mono-cell">{r.elo.toFixed(0)}</td>
                    <td>
                      <Sparkbar elo={r.elo} />
                    </td>
                    <td className="mono-cell">{ci}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="hollow">No Elo data yet.</div>
        )}
      </div>
    </>
  );
}