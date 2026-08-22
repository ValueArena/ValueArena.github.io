'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONSTITUTIONS } from '@/lib/config';
import { fetchIndex, fetchSummary } from '@/lib/hf';
import { collectionTypeLabel, runEvaluationMode } from '@/lib/protocol';
import { detectLab, LAB_COLORS, labColor } from '@/lib/labs';
import { constLabel, normConst } from '@/lib/nicks';
import { CONSTITUTIONS_DATA } from '@/lib/constitutions-data';
import { CONSTITUTION_SUMMARIES } from '@/lib/taglines';
import type { IndexRun, Summary, SummaryRow } from '@/lib/types';
import { ModelLogo } from './ModelLogo';
import { Penguin } from '@/components/Penguin';

type View = 'ranking' | 'plot' | 'pareto';
type GroupBy = 'model' | 'lab';

export function Leaderboard() {
  const [runs, setRuns] = useState<IndexRun[] | null>(null);
  const [activeConst, setActiveConst] = useState<string>('kindness');
  const [activeRunSlug, setActiveRunSlug] = useState<string | null>(null);
  const [view, setView] = useState<View>('plot');
  const [groupBy, setGroupBy] = useState<GroupBy>('model');
  const [error, setError] = useState<string | null>(null);

  // Fetch just the index — render the pill row immediately. Summaries for
  // the active constitution are fetched lazily by ConstitutionRanking.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const index = await fetchIndex();
        if (cancelled) return;
        setRuns(index.runs || []);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Group runs by constitution
  const byConst = useMemo(() => {
    const m: Record<string, IndexRun[]> = {};
    if (!runs) return m;
    for (const r of runs) {
      const c = normConst(r.constitution);
      if (!c) continue;
      (m[c] ||= []).push(r);
    }
    return m;
  }, [runs]);

  // Combined constitution list: config + observed data, sorted.
  const allConst = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of CONSTITUTIONS) m.set(c.id.toLowerCase(), c.label);
    for (const c of Object.keys(byConst)) {
      if (!m.has(c)) m.set(c, c.charAt(0).toUpperCase() + c.slice(1));
    }
    return m;
  }, [byConst]);

  const constNames = useMemo(() => [...allConst.keys()].sort(), [allConst]);

  // Ensure activeConst is valid for the data we have.
  useEffect(() => {
    if (!runs) return;
    if (!allConst.has(activeConst)) {
      const first = constNames.find((c) => byConst[c]) || constNames[0];
      if (first) setActiveConst(first);
    }
  }, [runs, allConst, activeConst, constNames, byConst]);

  if (error) {
    return <div className="error">Failed to load leaderboard: {error}</div>;
  }
  if (!runs) {
    return <div className="loading"><Penguin state="loading" /><span>Loading leaderboard</span></div>;
  }
  if (!constNames.length) {
    return <div className="hollow">No leaderboard data available yet.</div>;
  }

  return (
    <div>
      <ConstPills
        constNames={constNames}
        active={activeConst}
        onPick={(c) => {
          setActiveConst(c);
          setActiveRunSlug(null);
        }}
        labelOf={(c) => allConst.get(c) || c}
        hasData={(c) => Boolean(byConst[c])}
      />
      <div className="lb-controls">
        <ViewTabs value={view} onChange={setView} />
        <GroupTabs value={groupBy} onChange={setGroupBy} />
      </div>

      {view === 'pareto' ? (
        <ParetoView byConst={byConst} labelOf={(c) => allConst.get(c) || c} />
      ) : byConst[activeConst] ? (
        <ConstitutionRanking
          runs={byConst[activeConst]}
          view={view}
          groupBy={groupBy}
          activeConst={activeConst}
          activeRunSlug={activeRunSlug}
          setActiveRunSlug={setActiveRunSlug}
        />
      ) : (
        <div className="hollow">No experiment runs yet for this constitution.</div>
      )}

      <ConstitutionSection constId={activeConst} label={allConst.get(activeConst) || activeConst} />
    </div>
  );
}

function ConstPills({
  constNames,
  active,
  onPick,
  labelOf,
  hasData,
}: {
  constNames: string[];
  active: string;
  onPick: (c: string) => void;
  labelOf: (c: string) => string;
  hasData: (c: string) => boolean;
}) {
  return (
    <div className="const-pills">
      {constNames.map((c) => {
        const isActive = c === active;
        const hd = hasData(c);
        return (
          <button
            key={c}
            onClick={() => onPick(c)}
            className={`const-pill${isActive ? ' active' : ''}${hd ? '' : ' no-data'}`}
          >
            {labelOf(c)}
          </button>
        );
      })}
    </div>
  );
}

function ViewTabs({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const tabs: { id: View; label: string }[] = [
    { id: 'ranking', label: 'Ranking' },
    { id: 'plot', label: 'Plot' },
    { id: 'pareto', label: 'Pareto' },
  ];
  return (
    <div className="lb-view-tabs">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`lb-view-tab${t.id === value ? ' active' : ''}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function GroupTabs({ value, onChange }: { value: GroupBy; onChange: (v: GroupBy) => void }) {
  const tabs: { id: GroupBy; label: string }[] = [
    { id: 'model', label: 'By Model' },
    { id: 'lab', label: 'By Lab' },
  ];
  return (
    <div className="lb-group-tabs">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`lb-group-tab${t.id === value ? ' active' : ''}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ConstitutionRanking({
  runs,
  view,
  groupBy,
  activeConst,
  activeRunSlug,
  setActiveRunSlug,
}: {
  runs: IndexRun[];
  view: View;
  groupBy: GroupBy;
  activeConst: string;
  activeRunSlug: string | null;
  setActiveRunSlug: (s: string) => void;
}) {
  const sorted = useMemo(
    () => [...runs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [runs]
  );
  const [selectedSlug, setSelectedSlug] = useState<string | null>(activeRunSlug);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Resolve which run to display: explicit selection, else "most models",
  // ties broken by recency. Matches the legacy default-run logic.
  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setLoadError(null);
    (async () => {
      try {
        let resolvedSlug: string;
        if (activeRunSlug) {
          resolvedSlug = sorted.find((r) => r.slug === activeRunSlug)?.slug ?? sorted[0].slug;
        } else {
          const summaries = await Promise.all(
            sorted.map((r) => fetchSummary(r.slug).catch(() => null))
          );
          let bestIdx = 0;
          let bestCount = Array.isArray(summaries[0]) ? summaries[0]!.length : 0;
          for (let i = 1; i < sorted.length; i++) {
            const n = Array.isArray(summaries[i]) ? summaries[i]!.length : 0;
            if (n > bestCount) {
              bestCount = n;
              bestIdx = i;
            }
          }
          resolvedSlug = sorted[bestIdx].slug;
        }
        if (cancelled) return;
        setSelectedSlug(resolvedSlug);
        const data = await fetchSummary(resolvedSlug);
        if (!cancelled) setSummary(data);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sorted, activeRunSlug]);

  const selected = sorted.find((r) => r.slug === selectedSlug);

  if (loadError) {
    return <div className="hollow">Could not load rankings for this constitution.</div>;
  }
  if (!summary || !selected) {
    return <div className="loading"><Penguin state="loading" /><span>Loading rankings…</span></div>;
  }

  const ranked = [...summary].sort((a, b) => (b.elo_mean || 0) - (a.elo_mean || 0));
  const lbSummary = CONSTITUTION_SUMMARIES[activeConst];

  return (
    <div>
      <div className="lb-run-info">
        Based on{' '}
        <a className="link-subtle" href={`/run/?slug=${encodeURIComponent(selected.slug)}`}>
          {selected.name || selected.slug}
        </a>{' '}
        <span className="text-text-muted">
          · {collectionTypeLabel(runEvaluationMode(selected))} · {ranked.length} models ·{' '}
          {fmtDateShort(selected.timestamp)}
        </span>
      </div>
      {lbSummary ? (
        <div className="lb-const-summary">
          <em>{lbSummary}</em>
          {CONSTITUTIONS_DATA[activeConst]?.length ? (
            <span className="text-text-muted"> · {CONSTITUTIONS_DATA[activeConst].length} criteria</span>
          ) : null}
        </div>
      ) : null}
      {sorted.length > 1 ? (
        <RunSelect
          runs={sorted}
          value={selected.slug}
          onChange={(s) => {
            setActiveRunSlug(s);
          }}
        />
      ) : null}
      {view === 'plot' ? (
        <PlotView ranked={ranked} groupBy={groupBy} />
      ) : (
        <RankingTable ranked={ranked} groupBy={groupBy} />
      )}
    </div>
  );
}

function RunSelect({
  runs,
  value,
  onChange,
}: {
  runs: IndexRun[];
  value: string;
  onChange: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = runs.find((r) => r.slug === value) || runs[0];
  const labelOf = (r: IndexRun) =>
    `${r.name || r.slug} · ${collectionTypeLabel(runEvaluationMode(r))} (${fmtDateShort(r.timestamp)})`;

  return (
    <div className="lb-run-selector">
      <span className="lb-run-selector-label">Run</span>
      <div
        ref={wrapRef}
        className={`custom-select lb-run-custom-select${open ? ' open' : ''}`}
      >
        <button
          type="button"
          className="custom-select-trigger"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="lb-run-trigger-text">{labelOf(selected)}</span>
        </button>
        {open ? (
          <div className="custom-select-dropdown" role="listbox">
            {runs.map((r) => (
              <button
                key={r.slug}
                type="button"
                role="option"
                aria-selected={r.slug === value}
                className={`custom-select-option${r.slug === value ? ' selected' : ''}`}
                onClick={() => {
                  onChange(r.slug);
                  setOpen(false);
                }}
              >
                <span>{labelOf(r)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RankingTable({ ranked, groupBy }: { ranked: SummaryRow[]; groupBy: GroupBy }) {
  if (groupBy === 'lab') return <LabGroupedTable ranked={ranked} />;
  return (
    <div className="table-wrap">
      <table className="elo-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Model</th>
            <th>Lab</th>
            <th className="mono-cell">Elo</th>
            <th className="mono-cell">95% CI</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((m, i) => {
            const lab = detectLab(m.model_name);
            const ci =
              m.elo_ci_lower && m.elo_ci_upper
                ? `${m.elo_ci_lower.toFixed(0)} – ${m.elo_ci_upper.toFixed(0)}`
                : '—';
            return (
              <tr key={m.model_name}>
                <td className="mono-cell">{i + 1}</td>
                <td>
                  <ModelLogo name={m.model_name} size={14} className="mr-1.5" />
                  <a className="link-subtle" href={`/model/?id=${encodeURIComponent(m.model_name)}`}>
                    {m.model_name}
                  </a>
                </td>
                <td>{lab}</td>
                <td className="mono-cell">{(m.elo_mean || 0).toFixed(0)}</td>
                <td className="mono-cell">{ci}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LabGroupedTable({ ranked }: { ranked: SummaryRow[] }) {
  const byLab: Record<string, SummaryRow[]> = {};
  for (const m of ranked) (byLab[detectLab(m.model_name)] ||= []).push(m);
  const labOrder = Object.keys(byLab).sort(
    (a, b) =>
      Math.max(...byLab[b].map((m) => m.elo_mean || 0)) -
      Math.max(...byLab[a].map((m) => m.elo_mean || 0))
  );

  let globalRank = 1;
  return (
    <div className="table-wrap">
      <table className="elo-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Model</th>
            <th>Lab</th>
            <th className="mono-cell">Elo</th>
            <th className="mono-cell">95% CI</th>
          </tr>
        </thead>
        <tbody>
          {labOrder.flatMap((lab) => {
            const models = [...byLab[lab]].sort((a, b) => (b.elo_mean || 0) - (a.elo_mean || 0));
            const bestElo = models[0].elo_mean || 0;
            const avgElo = models.reduce((s, m) => s + (m.elo_mean || 0), 0) / models.length;
            const dot = labColor(models[0].model_name);
            const headerKey = `header-${lab}`;
            const headerRow = (
              <tr key={headerKey} className="lb-lab-group-row">
                <td colSpan={5} style={{ background: 'var(--bg)' }}>
                  <span className="lb-lab-dot" style={{ background: dot }} />{' '}
                  <strong>{lab}</strong>{' '}
                  <span className="text-text-muted">
                    · {models.length} model{models.length > 1 ? 's' : ''}
                  </span>{' '}
                  <span className="text-text-muted">
                    · Best: {bestElo.toFixed(0)} · Avg: {avgElo.toFixed(0)}
                  </span>
                </td>
              </tr>
            );
            const dataRows = models.map((m) => {
              const ci =
                m.elo_ci_lower && m.elo_ci_upper
                  ? `${m.elo_ci_lower.toFixed(0)} – ${m.elo_ci_upper.toFixed(0)}`
                  : '—';
              const row = (
                <tr key={m.model_name}>
                  <td className="mono-cell">{globalRank}</td>
                  <td>
                    <ModelLogo name={m.model_name} size={14} className="mr-1.5" />
                    <a className="link-subtle" href={`/model/?id=${encodeURIComponent(m.model_name)}`}>
                      {m.model_name}
                    </a>
                  </td>
                  <td>{lab}</td>
                  <td className="mono-cell">{(m.elo_mean || 0).toFixed(0)}</td>
                  <td className="mono-cell">{ci}</td>
                </tr>
              );
              globalRank++;
              return row;
            });
            return [headerRow, ...dataRows];
          })}
        </tbody>
      </table>
    </div>
  );
}

function PlotView({ ranked, groupBy }: { ranked: SummaryRow[]; groupBy: GroupBy }) {
  const maxElo = Math.max(...ranked.map((m) => m.elo_mean || 0));
  const minElo = Math.min(...ranked.map((m) => m.elo_mean || 0));
  const range = maxElo - minElo || 1;

  const bars: React.ReactNode[] = [];
  let i = 0;

  if (groupBy === 'lab') {
    const byLab: Record<string, SummaryRow[]> = {};
    for (const m of ranked) (byLab[detectLab(m.model_name)] ||= []).push(m);
    const labOrder = Object.keys(byLab).sort(
      (a, b) =>
        Math.max(...byLab[b].map((m) => m.elo_mean || 0)) -
        Math.max(...byLab[a].map((m) => m.elo_mean || 0))
    );
    for (const lab of labOrder) {
      bars.push(
        <div key={`hdr-${lab}`} className="lb-plot-group-header">
          <span className="lb-lab-dot" style={{ background: labColor(byLab[lab][0].model_name) }} />{' '}
          {lab}
        </div>
      );
      for (const m of byLab[lab]) bars.push(<PlotRow key={m.model_name} m={m} idx={i++} minElo={minElo} range={range} />);
    }
  } else {
    for (const m of ranked) bars.push(<PlotRow key={m.model_name} m={m} idx={i++} minElo={minElo} range={range} />);
  }

  return <div className="lb-plot">{bars}</div>;
}

function PlotRow({ m, idx, minElo, range }: { m: SummaryRow; idx: number; minElo: number; range: number }) {
  const elo = m.elo_mean || 0;
  const pct = ((elo - minElo) / range) * 100;
  const color = labColor(m.model_name);
  return (
    <div className="lb-plot-row" style={{ animationDelay: `${idx * 30}ms` }}>
      <div className="lb-plot-label" title={m.model_name}>
        <ModelLogo name={m.model_name} size={14} className="mr-1.5" />
        <a className="link-subtle" href={`/model/?id=${encodeURIComponent(m.model_name)}`}>
          {m.model_name}
        </a>
      </div>
      <div className="lb-plot-bar-wrap">
        <div
          className="lb-plot-bar"
          style={{ width: `${Math.max(2, pct)}%`, background: color }}
        />
      </div>
      <div className="lb-plot-value">{elo.toFixed(0)}</div>
    </div>
  );
}

function ParetoView({
  byConst,
  labelOf,
}: {
  byConst: Record<string, IndexRun[]>;
  labelOf: (c: string) => string;
}) {
  const [data, setData] = useState<{
    constCols: string[];
    modelNames: string[];
    cells: Record<string, Record<string, number>>;
    gMin: number;
    gMax: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const constWithData = Object.keys(byConst);
        const cells: Record<string, Record<string, number>> = {};
        await Promise.all(
          constWithData.map(async (c) => {
            const sorted = [...byConst[c]].sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
            const summary = await fetchSummary(sorted[0].slug).catch(() => null);
            if (!summary) return;
            for (const m of summary) {
              (cells[m.model_name] ||= {})[c] = m.elo_mean || 0;
            }
          })
        );
        const modelNames = Object.keys(cells).sort((a, b) => {
          const avg = (n: string) =>
            Object.values(cells[n]).reduce((s, v) => s + v, 0) / Object.values(cells[n]).length;
          return avg(b) - avg(a);
        });
        const constCols = constWithData.slice().sort();
        let gMin = Infinity;
        let gMax = -Infinity;
        for (const name of modelNames) {
          for (const c of constCols) {
            const v = cells[name]?.[c];
            if (v != null) {
              gMin = Math.min(gMin, v);
              gMax = Math.max(gMax, v);
            }
          }
        }
        if (!cancelled) setData({ constCols, modelNames, cells, gMin, gMax });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [byConst]);

  if (error) return <div className="hollow">Could not load Pareto data: {error}</div>;
  if (!data) return <div className="loading"><Penguin state="loading" /><span>Loading multi-constitution data…</span></div>;
  if (!data.modelNames.length) return <div className="hollow">No data available for Pareto view.</div>;

  const range = data.gMax - data.gMin || 1;

  return (
    <div className="lb-run-info" style={{ marginTop: 16 }}>
      Cross-constitution comparison · {data.modelNames.length} models · {data.constCols.length} constitutions
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="elo-table lb-pareto-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Model</th>
              <th>Lab</th>
              <th className="mono-cell">Avg</th>
              {data.constCols.map((c) => (
                <th key={c} className="mono-cell">
                  <a className="link-subtle" href={`/constitution/?id=${encodeURIComponent(c)}`}>
                    {labelOf(c)}
                  </a>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.modelNames.map((name, i) => {
              const lab = detectLab(name);
              const vals = Object.values(data.cells[name]);
              const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
              return (
                <tr key={name}>
                  <td className="mono-cell">{i + 1}</td>
                  <td>
                    <ModelLogo name={name} size={14} className="mr-1.5" />
                    <a className="link-subtle" href={`/model/?id=${encodeURIComponent(name)}`}>
                      {name}
                    </a>
                  </td>
                  <td>{lab}</td>
                  <td className="mono-cell">{avg.toFixed(0)}</td>
                  {data.constCols.map((c) => {
                    const v = data.cells[name]?.[c];
                    if (v == null) {
                      return (
                        <td key={c} className="mono-cell" style={{ color: 'var(--text-muted)' }}>
                          —
                        </td>
                      );
                    }
                    const t = (v - data.gMin) / range;
                    const alpha = 0.08 + t * 0.25;
                    return (
                      <td
                        key={c}
                        className="mono-cell"
                        style={{ background: `rgba(232,164,74,${alpha.toFixed(2)})` }}
                      >
                        {v.toFixed(0)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConstitutionSection({ constId, label }: { constId: string; label: string }) {
  const criteria = CONSTITUTIONS_DATA[constId];
  if (!criteria || !criteria.length) return null;
  return (
    <div className="card" style={{ marginTop: 32 }}>
      <h2>{label} Constitution</h2>
      <div className="card-caption">{criteria.length} criteria</div>
      <div className="scripture">
        {criteria.map((text, i) => (
          <div key={i} className="criterion-article">
            <div className="criterion-numeral">{String(i + 1).padStart(2, '0')}</div>
            <div className="criterion-text">{text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtDateShort(ts?: string): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
