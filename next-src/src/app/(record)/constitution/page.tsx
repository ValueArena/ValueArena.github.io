'use client';

import { useEffect, useState } from 'react';
import { REF_ANCHOR, REF_NICKS } from '@/lib/config';
import { fetchIndex, fetchMeta, fetchSummary } from '@/lib/hf';
import { constLabel, normConst } from '@/lib/nicks';
import { CONSTITUTIONS_DATA } from '@/lib/constitutions-data';
import type { IndexRun, MetaJson, Summary } from '@/lib/types';
import { ModelLogo } from '@/components/ModelLogo';
import { Sparkbar } from '@/components/Sparkbar';
import { ValuePortrait } from '@/components/ValuePortrait';

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
  const [id, setId] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const id = normConst((params.get('id') || '').replace(/ /g, '+'));
      if (!id) {
        if (!cancelled) setState({ status: 'no-id' });
        return;
      }
      setId(id);
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
    if (id) document.title = `ValueArena — ${constLabel(id)}`;
  }, [id]);

  if (!id && state.status === 'loading') return <p className="results-status" role="status">Loading constitution…</p>;
  if (state.status === 'no-id')
    return (
      <div className="error">
        No constitution specified. <a href="/">Back</a>
      </div>
    );
  const label = constLabel(id);
  const criteria = CONSTITUTIONS_DATA[id] || [];
  const runs = state.status === 'ok' ? state.runs : [];

  // Most-recent appearance per model nick across all runs for this constitution.
  const byNick = new Map<
    string,
    { nick: string; elo: number; ci_low?: number; ci_high?: number; type: string; run: IndexRun }
  >();
  for (const { run, meta, summary } of runs) {
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
    <div className="constitution-detail">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="/constitutions/">All values</a><span aria-hidden="true">/</span><span aria-current="page">{label}</span>
      </nav>

      <header className="constitution-heading">
        <h1>{label}</h1>
        <a className="results-button" href={`/leaderboard/?constitution=${encodeURIComponent(id)}`}>View leaderboard</a>
      </header>

      <div className="constitution-reading">
        <aside className="constitution-portrait"><ValuePortrait id={id} priority /></aside>
        <section className="constitution-criteria" aria-labelledby="constitution-criteria-heading">
          <header className="constitution-criteria-heading">
            <h2 id="constitution-criteria-heading">Evaluation criteria</h2>
            <span aria-label={`${criteria.length} criteria`}>{String(criteria.length).padStart(2, '0')}</span>
          </header>
          {criteria.length ? (
            <ol className="scripture">
              {criteria.map((text, i) => (
                <li key={i} className="criterion-article">
                  <span className="criterion-numeral" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  <div className="criterion-text">{text.split(/(\*[^*]+\*)/g).map((part, n) => part.startsWith('*') && part.endsWith('*') ? <em key={n}>{part.slice(1, -1)}</em> : part)}</div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="hollow">No criteria text available for this constitution.</div>
          )}
        </section>
      </div>

      <section className="constitution-results" aria-labelledby="constitution-results-heading">
        <div className="constitution-results-heading"><h2 id="constitution-results-heading">Model results</h2><span>{rows.length ? `${rows.length} models` : ''}</span></div>
        {state.status === 'loading' ? <p className="results-status" role="status">Loading model results…</p> : state.status === 'error' ? <p className="results-status" role="alert">Model results could not be loaded. The criteria above are available.</p> : rows.length ? (
          <div className="results-table-scroll">
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
                      <a className="link-subtle" href={`/model/?id=${encodeURIComponent(r.nick)}&run=${encodeURIComponent(r.run.slug)}`}>
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
          </div>
        ) : (
          <div className="hollow">No Elo data yet.</div>
        )}
      </section>
    </div>
  );
}
