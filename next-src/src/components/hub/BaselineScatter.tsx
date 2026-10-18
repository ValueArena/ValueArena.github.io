'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchSummary } from '@/lib/hf';
import { getModelLogo } from '@/lib/config';
import { agreement, baselineAgreement, spearman } from '@/lib/hub';
import { BASELINES, PLANNED_BASELINES, TREND_RUN, modelInfo } from '@/lib/registry';
import type { SummaryRow } from '@/lib/types';
import { LogoTile, Tip, niceTicks } from './ui';
import { useWidth } from './useWidth';

interface Pt { name: string; x: number; y: number; exact: boolean; sourceModel: string; n: number }

/** Least-squares line through the points, as [slope, intercept]. */
function fit(points: Pt[]): [number, number] | null {
  const n = points.length;
  if (n < 3) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n, my = points.reduce((s, p) => s + p.y, 0) / n;
  const sxx = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (!sxx) return null;
  const slope = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx;
  return [slope, my - slope * mx];
}

export function BaselineScatter({ boardRows, boardName }: { boardRows: SummaryRow[]; boardName: string }) {
  const [baselineId, setBaselineId] = useState(BASELINES[0].id);
  // null follows the selected benchmark to whichever run shares more models with it.
  const [picked, setPicked] = useState<'board' | 'wide' | null>(null);
  const [wide, setWide] = useState<SummaryRow[] | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>(460);

  useEffect(() => { fetchSummary(TREND_RUN).then(setWide).catch(() => setWide([])); }, []);

  const baseline = BASELINES.find(b => b.id === baselineId) ?? BASELINES[0];
  const matches = (rs: SummaryRow[]) => rs.filter(r => baseline.rows[r.model_name]).length;
  const source = picked ?? (matches(wide || []) > matches(boardRows) ? 'wide' : 'board');
  const rows = source === 'board' ? boardRows : wide || [];
  const points = useMemo<Pt[]>(() => rows.flatMap(row => {
    const cell = baseline.rows[row.model_name];
    return cell ? [{ name: row.model_name, x: cell.score, y: row.elo_mean, exact: cell.exact, sourceModel: cell.source_model, n: cell.n }] : [];
  }), [rows, baseline]);
  // Agreement with every benchmark, each on the run that shares the most models with it.
  const summary = BASELINES.map(b => ({ b, a: baselineAgreement(b, [boardRows, wide || []], 3) }));
  const rho = spearman(points.map(p => p.x), points.map(p => p.y));
  const line = fit(points);

  const narrow = width < 440;
  const height = narrow ? 260 : 290;
  const m = { top: 16, right: 18, bottom: 44, left: 52 };
  const r = points.length > 16 || narrow ? 9 : 12;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const padX = Math.max(2, (Math.max(...xs) - Math.min(...xs)) * 0.08);
  const xTicks = points.length ? niceTicks(Math.min(...xs) - padX, Math.max(...xs) + padX, narrow ? 4 : 5) : [];
  const yTicks = points.length ? niceTicks(Math.min(...ys) - 20, Math.max(...ys) + 20, 4) : [];
  const [x0, x1] = points.length ? [Math.min(xTicks[0], Math.min(...xs) - padX), Math.max(xTicks[xTicks.length - 1], Math.max(...xs) + padX)] : [0, 1];
  const [y0, y1] = points.length ? [Math.min(yTicks[0], Math.min(...ys) - 20), Math.max(yTicks[yTicks.length - 1], Math.max(...ys) + 20)] : [0, 1];
  const px = (v: number) => m.left + ((v - x0) / (x1 - x0)) * (width - m.left - m.right);
  const py = (v: number) => m.top + (1 - (v - y0) / (y1 - y0)) * (height - m.top - m.bottom);
  const baseY = height - m.bottom;

  // Name the models furthest from the trend: those where the two benchmarks disagree most.
  const labelled = useMemo(() => {
    if (narrow || !line) return new Set<string>();
    const resid = points.map(p => ({ p, d: Math.abs(p.y - (line[0] * p.x + line[1])) })).sort((a, b) => b.d - a.d);
    return new Set(resid.slice(0, points.length <= 10 ? points.length : 4).map(e => e.p.name));
  }, [points, line, narrow]);
  // Each label tries right, left, above and below its marker, and takes the first spot that is
  // clear of other labels and markers and inside the plot.
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const markers = points.map(p => ({ name: p.name, box: { x0: px(p.x) - r - 2, x1: px(p.x) + r + 2, y0: py(p.y) - r - 2, y1: py(p.y) + r + 2 } }));
  const taken: Box[] = [];
  const labels = new Map<string, { x: number; y: number; anchor: 'start' | 'middle' | 'end' }>();
  for (const p of [...points].filter(p => labelled.has(p.name)).sort((a, b) => py(a.y) - py(b.y))) {
    const w = p.name.length * 6.4, cx = px(p.x), cy = py(p.y);
    const options = [
      { x: cx + r + 6, y: cy, anchor: 'start' as const, box: { x0: cx + r + 4, x1: cx + r + 8 + w, y0: cy - 7, y1: cy + 7 } },
      { x: cx - r - 6, y: cy, anchor: 'end' as const, box: { x0: cx - r - 8 - w, x1: cx - r - 4, y0: cy - 7, y1: cy + 7 } },
      { x: cx, y: cy - r - 10, anchor: 'middle' as const, box: { x0: cx - w / 2, x1: cx + w / 2, y0: cy - r - 17, y1: cy - r - 3 } },
      { x: cx, y: cy + r + 10, anchor: 'middle' as const, box: { x0: cx - w / 2, x1: cx + w / 2, y0: cy + r + 3, y1: cy + r + 17 } },
    ];
    const inside = (b: Box) => b.x0 >= m.left && b.x1 <= width - 2 && b.y0 >= 0 && b.y1 <= baseY;
    const pick = options.find(o => inside(o.box) && !taken.some(t => hits(t, o.box)) && !markers.some(mk => mk.name !== p.name && hits(mk.box, o.box)));
    if (!pick) continue;
    taken.push(pick.box);
    labels.set(p.name, { x: pick.x, y: pick.y, anchor: pick.anchor });
  }

  return (
    <section className="hub-card" aria-labelledby="hub-baseline-title">
      <header className="hub-card-head">
        <div>
          <p className="hub-eyebrow">Baselines</p>
          <h2 id="hub-baseline-title" className="hub-title">EigenBench vs. other benchmarks</h2>
          <p className="hub-sub">Kindness set against published measures of honesty, sycophancy and empathy, and plain popularity</p>
        </div>
        <div className="hub-tabs" role="tablist" aria-label="Models">
          <button role="tab" aria-selected={source === 'board'} onClick={() => setPicked('board')}>{boardName}</button>
          <button role="tab" aria-selected={source === 'wide'} onClick={() => setPicked('wide')}>Kindness · 37 models</button>
        </div>
      </header>

      <div className="hub-bench" role="tablist" aria-label="Benchmark">
        {summary.map(({ b, a }) => (
          <button key={b.id} role="tab" aria-selected={b === baseline} onClick={() => { setBaselineId(b.id); setPicked(null); }} title={b.about}>
            <span className="hub-bench-name">{b.short}</span>
            <strong>{a ? `ρ ${a.rho.toFixed(2)}` : '—'}</strong>
            <small>{a ? `${a.n} models` : 'too few shared'}</small>
          </button>
        ))}
      </div>
      <p className="hub-bench-about"><strong>{baseline.name}.</strong> {baseline.about}</p>

      <div className="hub-mini-stats">
        <div>
          <strong>{rho == null ? '—' : `ρ ${rho.toFixed(2)}`}</strong>
          <span>{rho == null ? `Too few models shared with ${baseline.name} here` : `${agreement(rho)} · Spearman, ${points.length} models`}</span>
        </div>
        {rho != null && points.length < 12 && <p className="hub-caveat">Small sample: read loosely.</p>}
      </div>

      <div className="hub-chart" ref={ref} onPointerLeave={() => setHover(null)}>
        {points.length > 0 && (
          <svg width={width} height={height} role="img" aria-label={`EigenBench ${source === 'board' ? boardName : 'kindness'} score against ${baseline.name}`}>
            {yTicks.map(t => (
              <g key={`y${t}`}>
                <line x1={m.left} x2={width - m.right} y1={py(t)} y2={py(t)} className="hub-grid" />
                <text x={m.left - 10} y={py(t)} className="hub-axis" textAnchor="end" dominantBaseline="middle">{t}</text>
              </g>
            ))}
            {xTicks.map(t => (
              <g key={`x${t}`}>
                <line x1={px(t)} x2={px(t)} y1={m.top} y2={baseY} className="hub-grid hub-grid-faint" />
                <text x={px(t)} y={baseY + 18} className="hub-axis" textAnchor="middle">{t}</text>
              </g>
            ))}
            <line x1={m.left} x2={width - m.right} y1={baseY} y2={baseY} className="hub-baseline" />
            <text x={width - m.right} y={height - 4} className="hub-axis-title" textAnchor="end">{baseline.short} →</text>
            <text x={m.left} y={m.top - 4} className="hub-axis-title">↑ EigenBench</text>
            {line && (
              <line x1={px(x0)} x2={px(x1)} y1={py(line[0] * x0 + line[1])} y2={py(line[0] * x1 + line[1])}
                className="hub-fit" clipPath="url(#hub-scatter-clip)" />
            )}
            <defs>
              <clipPath id="hub-scatter-clip"><rect x={m.left} y={m.top} width={width - m.left - m.right} height={baseY - m.top} /></clipPath>
            </defs>
            {points.map(p => {
              const logo = getModelLogo(modelInfo(p.name)?.id ?? p.name);
              const cx = px(p.x), cy = py(p.y), on = hover === p;
              return (
                <g key={p.name} className="hub-scatter-mark" data-on={on || undefined}>
                  <circle cx={cx} cy={cy} r={on ? r + 2 : r} className={p.exact ? 'hub-scatter-ring' : 'hub-scatter-ring hub-scatter-variant'} />
                  {logo && (
                    <foreignObject x={cx - r * 0.6} y={cy - r * 0.6} width={r * 1.2} height={r * 1.2} pointerEvents="none">
                      <img src={logo} alt="" width={r * 1.2} height={r * 1.2} style={{ display: 'block' }} />
                    </foreignObject>
                  )}
                  {labels.has(p.name) && (
                    <text x={labels.get(p.name)!.x} y={labels.get(p.name)!.y} className="hub-point-label" dominantBaseline="middle" textAnchor={labels.get(p.name)!.anchor}>{p.name}</text>
                  )}
                  <circle cx={cx} cy={cy} r={Math.max(14, r + 4)} className="hub-hit" tabIndex={0}
                    aria-label={`${p.name}: ${baseline.short} ${p.x.toFixed(0)}, EigenBench ${p.y.toFixed(0)}`}
                    onPointerEnter={() => setHover(p)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(p)} onBlur={() => setHover(null)} />
                </g>
              );
            })}
          </svg>
        )}
        {hover && (
          <Tip x={px(hover.x) + 6} y={py(hover.y) - 100} width={width}>
            <span className="hub-tip-head"><LogoTile name={hover.name} size={18} />{hover.name}</span>
            <span className="hub-tip-row"><strong>{hover.y.toFixed(0)}</strong><span>EigenBench</span></span>
            <span className="hub-tip-row"><strong>{hover.x.toFixed(0)}</strong><span>{baseline.short}{hover.exact ? '' : `, as ${hover.sourceModel}`}</span></span>
            {hover.n > 0 && <span className="hub-tip-group">{hover.n.toLocaleString()} {baseline.unit}</span>}
          </Tip>
        )}
      </div>

      <ul className="hub-legend">
        <li><i className="hub-key hub-key-ring" /> Same model in {baseline.name}</li>
        <li><i className="hub-key hub-key-ring hub-key-dashed" /> Another effort setting or chat version</li>
        {line && <li><i className="hub-key hub-key-fit" /> Trend</li>}
      </ul>
      {points.length > 0 && (
        <details className="hub-details">
          <summary>Show as a table</summary>
          <table className="hub-table hub-table-compact">
            <thead><tr><th scope="col">Model</th><th scope="col" className="num">{baseline.short}</th><th scope="col" className="num">EigenBench</th></tr></thead>
            <tbody>
              {[...points].sort((a, b) => b.y - a.y).map(p => (
                <tr key={p.name}><td>{p.name}</td><td className="num">{p.exact ? '' : '≈'}{p.x.toFixed(0)}</td><td className="num">{p.y.toFixed(0)}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      <div className="hub-planned">
        <span className="hub-planned-label">Next baselines</span>
        {PLANNED_BASELINES.map(b => <span key={b.id} className="hub-planned-item" title={b.what}>{b.name}<span className="hub-soon">Soon</span></span>)}
        <span className="hub-planned-item" title="Harmful-request compliance and over-refusal, run through Inspect.">StrongREJECT + XSTest<span className="hub-soon">Soon</span></span>
      </div>
      <p className="hub-foot">{baseline.name}: {baseline.metric}, {baseline.published} · {baseline.attribution} · <a href={baseline.source}>{baseline.license}</a>. Models it doesn’t list are left out.</p>
    </section>
  );
}
