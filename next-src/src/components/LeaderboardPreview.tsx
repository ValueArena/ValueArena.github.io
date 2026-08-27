'use client';

// A short standings table for the home page: the top few models under one
// constitution, with the way through to the full leaderboard. Reads the same
// index.json and run summary the full view does — both are memoised in lib/hf,
// so opening the leaderboard afterwards costs nothing extra.

import { useEffect, useMemo, useState } from 'react';
import { fetchIndex, fetchSummary } from '@/lib/hf';
import { constLabel, normConst } from '@/lib/nicks';
import type { IndexRun, SummaryRow } from '@/lib/types';
import { ModelLogo } from './ModelLogo';

/** Constitution shown before anyone picks one. */
const DEFAULT_CONSTITUTION = 'kindness';

const ROWS = 5;

function modelCount(run: IndexRun | undefined): number {
  const n = Number(run?.models_count);
  return Number.isFinite(n) ? n : 0;
}

export function LeaderboardPreview() {
  const [runs, setRuns] = useState<IndexRun[] | null>(null);
  const [summary, setSummary] = useState<SummaryRow[] | null>(null);
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

  // Pick the run the full leaderboard would open on, so the two never
  // disagree: the one covering the most models, ties broken by recency
  // (ConstitutionRanking in Leaderboard.tsx resolves it the same way, by
  // counting summary rows — models_count in the index is that same number,
  // and reading it here costs no extra requests).
  const run = useMemo(() => {
    if (!runs?.length) return null;
    const byRecency = [...runs].sort((a, b) =>
      String(b.timestamp || '').localeCompare(String(a.timestamp || ''))
    );
    const forConstitution = byRecency.filter(
      (r) => normConst(r.constitution) === DEFAULT_CONSTITUTION
    );
    const pool = forConstitution.length ? forConstitution : byRecency;
    let best = pool[0];
    for (const candidate of pool) {
      if (modelCount(candidate) > modelCount(best)) best = candidate;
    }
    return best ?? null;
  }, [runs]);

  useEffect(() => {
    if (!run?.slug) return;
    let cancelled = false;
    fetchSummary(run.slug)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [run?.slug]);

  const top = useMemo(
    () => (summary ? [...summary].sort((a, b) => b.elo_mean - a.elo_mean).slice(0, ROWS) : []),
    [summary]
  );

  // A home page section that cannot load is noise; the nav still gets you
  // to the full view.
  if (failed) return null;

  const constitution = run ? constLabel(normConst(run.constitution)) : '';

  return (
    <section className="home-panel">
      <div className="home-panel-head">
        <div>
          <h2>Leaderboard</h2>
          <p className="home-panel-sub">
            {constitution ? `Top models under ${constitution}` : 'Top models by EigenTrust Elo'}
          </p>
        </div>
        <a className="home-panel-link" href="/leaderboard/">
          Full leaderboard →
        </a>
      </div>

      {top.length ? (
        <ol className="home-rank">
          {top.map((row, i) => (
            <li key={row.model_name} className="home-rank-row">
              <span className="home-rank-place">{i + 1}</span>
              <ModelLogo name={row.model_name} size={14} />
              <a
                className="home-rank-name link-subtle"
                href={`/model/?id=${encodeURIComponent(row.model_name)}`}
              >
                {row.model_name}
              </a>
              <span className="home-rank-elo">{row.elo_mean.toFixed(0)}</span>
            </li>
          ))}
        </ol>
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
