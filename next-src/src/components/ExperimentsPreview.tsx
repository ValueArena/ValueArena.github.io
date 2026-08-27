'use client';

// The most recent runs, on the home page. Everything shown here already sits
// in index.json — including each run's winning model — so this costs one
// fetch that the full Experiments table shares.

import { useEffect, useMemo, useState } from 'react';
import { fetchIndex } from '@/lib/hf';
import { constLabel, normConst } from '@/lib/nicks';
import type { IndexRun } from '@/lib/types';
import { ModelLogo } from './ModelLogo';

const ROWS = 5;

export function ExperimentsPreview() {
  const [runs, setRuns] = useState<IndexRun[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchIndex()
      .then((index) => {
        if (!cancelled) setRuns(index.runs || []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const recent = useMemo(() => {
    if (!runs) return [];
    return [...runs]
      .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
      .slice(0, ROWS);
  }, [runs]);

  if (failed) return null;

  return (
    <section className="home-panel">
      <div className="home-panel-head">
        <div>
          <h2>Experiments</h2>
          <p className="home-panel-sub">
            {runs ? `${runs.length} runs, newest first` : 'Recent runs'}
          </p>
        </div>
        <a className="home-panel-link" href="/experiments/">
          All experiments →
        </a>
      </div>

      {recent.length ? (
        <ul className="home-runs">
          {recent.map((run) => {
            const top = typeof run.top_model === 'string' ? run.top_model : '';
            return (
              <li key={run.slug} className="home-run">
                <a
                  className="home-run-name link-subtle"
                  href={`/run/?slug=${encodeURIComponent(run.slug)}`}
                >
                  {run.name || run.slug}
                </a>
                <span className="home-run-meta">
                  {run.constitution ? (
                    <span className="tag">{constLabel(normConst(run.constitution))}</span>
                  ) : null}
                  {typeof run.models_count === 'number' ? (
                    <span>{run.models_count} models</span>
                  ) : null}
                  <span>{fmtDate(run.timestamp)}</span>
                </span>
                {top ? (
                  <span className="home-run-top" title={`Top model: ${top}`}>
                    <ModelLogo name={top} size={13} />
                    {top}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="home-panel-placeholder" aria-hidden>
          {Array.from({ length: ROWS }, (_, i) => (
            <span key={i} className="home-skeleton" />
          ))}
        </div>
      )}
    </section>
  );
}

function fmtDate(ts?: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
