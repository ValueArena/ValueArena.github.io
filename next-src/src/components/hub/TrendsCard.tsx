'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Penguin } from '@/components/Penguin';
import { fetchSummary } from '@/lib/hf';
import { getModelLogo } from '@/lib/config';
import { LENSES, groupOf, runningBest, topLabs, type Lens, type ModelInfo, type TrendPoint } from '@/lib/hub';
import { TREND_RUN, modelInfo } from '@/lib/registry';
import type { SummaryRow } from '@/lib/types';
import { LogoTile, Tip, niceTicks } from './ui';
import { Sparks } from './sparks';
import { useWidth } from './useWidth';

// Series slots in validated order; the dash pattern is each series' second identity channel.
const SERIES = [
  { color: 'var(--s1)', dash: '' },
  { color: 'var(--s2)', dash: '7 5' },
  { color: 'var(--s3)', dash: '2 4' },
];

interface Point extends TrendPoint { info: ModelInfo; lo?: number; hi?: number }

const DAY = 864e5;
// One replay runs through the whole release history in this many milliseconds.
const PLAY_MS = 9000;
// Pause on the finished chart before moving on to the next grouping.
const CYCLE_PAUSE_MS = 3500;
const month = (t: number | string) => new Date(typeof t === 'string' ? `${t}T00:00:00Z` : t)
  .toLocaleDateString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** A step line with softly rounded corners, ending at endX. */
function stepPath(pts: { x: number; y: number }[], endX: number): string {
  if (!pts.length) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const r = Math.min(7, (b.x - a.x) / 2, Math.abs(b.y - a.y) / 2);
    const dir = b.y < a.y ? -1 : 1;
    d += `H${b.x - r}Q${b.x},${a.y} ${b.x},${a.y + dir * r}V${b.y - dir * r}Q${b.x},${b.y} ${b.x + r},${b.y}`;
  }
  return endX > pts[pts.length - 1].x ? `${d}H${endX}` : d;
}

/** The last stretch of a moving line, rippling like a plucked string near its head. */
function wave(fromX: number, y: number, headX: number, amp: number, phase: number): { d: string; headY: number } {
  const offset = (x: number) => amp * Math.sin((headX - x) * 0.13 - phase) * Math.exp(-(headX - x) / 60);
  const start = Math.max(fromX, headX - 140);
  let d = `H${start}`;
  for (let x = start; x < headX; x += 3) d += `L${x},${y + offset(x)}`;
  return { d: `${d}L${headX},${y + offset(headX)}`, headY: y + offset(headX) };
}

export function TrendsCard() {
  const [rows, setRows] = useState<SummaryRow[] | null>(null);
  const [lens, setLens] = useState<Lens>('license');
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>(900);
  // Playback: the date being shown and the frame time; null once the chart is complete.
  const [clock, setClock] = useState<{ t: number; now: number } | null>(null);
  const [playKey, setPlayKey] = useState(0);
  const [inView, setInView] = useState(false);
  // Cycle through the groupings on its own until the reader picks one.
  const auto = useRef(true);
  const [motion, setMotion] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const sparks = useRef<Sparks | null>(null);
  const skip = useRef(false);
  const onFrame = useRef<(t: number, now: number) => void>(() => {});
  // Per-group frame state: when each line last got a new leader, how many leaders it has had, who leads overall.
  const kicks = useRef(new Map<string, number>());

  useEffect(() => { fetchSummary(TREND_RUN).then(setRows).catch(() => setRows([])); }, []);

  const points = useMemo<Point[]>(() => (rows || []).flatMap(row => {
    const info = modelInfo(row.model_name);
    return info ? [{ name: row.model_name, date: info.released, score: row.elo_mean, info, lo: row.elo_ci_lower, hi: row.elo_ci_upper }] : [];
  }), [rows]);
  const labs = useMemo(() => topLabs(points.map(p => p.info)), [points]);
  const groups = useMemo(() => {
    const names = lens === 'license' ? ['Proprietary', 'Open weights'] : lens === 'country' ? ['US', 'China'] : labs;
    return names.map((name, i) => {
      const members = points.filter(p => groupOf(p.info, lens, labs) === name);
      return { name, ...SERIES[i], members, steps: runningBest(members) };
    });
  }, [points, lens, labs]);
  const span = useMemo(() => {
    if (!points.length) return null;
    const times = points.map(p => Date.parse(p.date));
    return { first: Math.min(...times), last: Math.max(...times) };
  }, [points]);

  // Start playing the first time the chart is mostly on screen.
  const sectionRef = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setInView(true); io.disconnect(); }
    }, { threshold: 0.35 });
    io.observe(node);
  }, []);
  const setChart = useCallback((node: HTMLDivElement | null) => { chartRef.current = node; ref(node); }, [ref]);

  useEffect(() => {
    if (!span || !inView) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced && playKey === 0) { setMotion(false); setClock(null); return; }
    kicks.current.clear();
    sparks.current?.stop();
    skip.current = false;
    let raf = 0, timer = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const k = skip.current ? 1 : Math.min(1, (now - start) / PLAY_MS);
      // Run on to the chart's right edge, where the finished lines end.
      const t = span.first + k * (span.last + 25 * DAY - span.first);
      if (!skip.current) onFrame.current(t, now);
      if (k < 1) {
        setClock({ t, now });
        raf = requestAnimationFrame(tick);
      } else {
        setClock(null);
        if (auto.current && !reduced && !skip.current) {
          timer = window.setTimeout(() => setLens(l => LENSES[(LENSES.findIndex(x => x.id === l) + 1) % LENSES.length].id), CYCLE_PAUSE_MS);
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [span, inView, lens, playKey]);

  const narrow = width < 640;
  const height = narrow ? 320 : 430;
  useEffect(() => {
    if (!canvasRef.current) return;
    sparks.current ??= new Sparks(canvasRef.current);
    sparks.current.resize(width, height);
  }, [width, height, rows]);
  useEffect(() => () => sparks.current?.stop(), []);

  if (rows === null) return <section className="hub-card"><div className="loading"><Penguin state="loading" size={32} /><span>Loading trends</span></div></section>;
  if (points.length < 3 || !span) return null;

  const pillW = narrow ? 0 : 196;
  const m = { top: 28, right: pillW + 18, bottom: 34, left: 46 };
  const t0 = span.first - 25 * DAY, t1 = span.last + 25 * DAY;
  const scores = points.map(p => p.score);
  const yTicks = niceTicks(Math.min(...scores) - 15, Math.max(...scores) + 15, narrow ? 4 : 6);
  const y0 = Math.min(yTicks[0], Math.min(...scores) - 15), y1 = Math.max(yTicks[yTicks.length - 1], Math.max(...scores) + 12);
  const endX = width - m.right;
  const px = (t: number) => m.left + ((t - t0) / (t1 - t0)) * (endX - m.left);
  const py = (s: number) => m.top + (1 - (s - y0) / (y1 - y0)) * (height - m.top - m.bottom);
  const baseY = height - m.bottom;
  const xTicks: number[] = [];
  for (let d = new Date(t0); d.getTime() <= t1; d.setUTCMonth(d.getUTCMonth() + 1)) {
    if (d.getUTCDate() !== 1) { d.setUTCDate(1); continue; }
    if (d.getUTCMonth() % (narrow ? 6 : 3) === 0 && d.getTime() >= t0) xTicks.push(d.getTime());
  }

  // Before it first scrolls into view, the chart waits at its first date, ready to play.
  const waiting = !inView && motion;
  const live = clock != null || waiting;
  const frame = clock ?? { t: span.first, now: 0 };
  const tNow = live ? frame.t : t1;
  const headX = live ? px(frame.t) : endX;
  const lines = groups.flatMap(g => {
    const reached = g.steps.filter(s => Date.parse(s.date) <= tNow);
    const pts = reached.map(s => ({ x: px(Date.parse(s.date)), y: py(s.score), step: s }));
    if (!pts.length) return [];
    const lastPt = pts[pts.length - 1];
    let line = stepPath(pts, live ? lastPt.x : endX), headY = lastPt.y;
    if (live && headX > lastPt.x + 8) {
      // The ripple kicks up when this line gets a new leader, then settles.
      const kick = Math.exp(-(frame.now - (kicks.current.get(g.name) ?? -1e9)) / 380);
      const w = wave(lastPt.x + 8, lastPt.y, headX, 1.6 + 7 * kick, frame.now / 110);
      line += w.d;
      headY = w.headY;
    }
    return [{ g, pts, line, area: `${line}V${baseY}H${pts[0].x}Z`, leader: lastPt.step, headY }];
  });

  // Each frame: a burst and a shredded label when a line gets a new leader, a clash when one group
  // overtakes another, and a faint trail behind every moving head.
  onFrame.current = (t, now) => {
    const s = sparks.current;
    if (!s) return;
    let top: { index: number; score: number } | null = null;
    groups.forEach((g, index) => {
      const reached = g.steps.filter(st => Date.parse(st.date) <= t);
      const best = reached[reached.length - 1];
      if (!best) return;
      const count = `${g.name}#n`, prev = kicks.current.get(count) ?? 0;
      if (reached.length > prev) {
        kicks.current.set(count, reached.length);
        if (prev > 0) {
          kicks.current.set(g.name, now);
          s.burst(px(Date.parse(best.date)), py(best.score), [g.color], 0.9);
          if (pillW) s.shred(px(t) + 26, px(t) + 26 + pillW * 0.75, py(reached[reached.length - 2].score), g.color);
        }
      }
      if (!top || best.score > top.score) top = { index, score: best.score };
      if (Math.random() < 0.35) s.trail(px(t), py(best.score), g.color);
    });
    const lead = kicks.current.get('#lead');
    if (top) {
      const { index, score } = top as { index: number; score: number };
      if (lead != null && lead !== index) {
        s.burst(px(t), py(score), [groups[index].color, groups[lead].color], 2.4);
        kicks.current.set(groups[index].name, now);
        kicks.current.set(groups[lead].name, now);
        chartRef.current?.animate(
          [{ transform: 'translate(0,0)' }, { transform: 'translate(-3px,1px)' }, { transform: 'translate(3px,-1px)' },
            { transform: 'translate(-2px,0)' }, { transform: 'translate(1px,1px)' }, { transform: 'translate(0,0)' }],
          { duration: 320, easing: 'ease-out' },
        );
      }
      kicks.current.set('#lead', index);
    }
  };

  // The biggest single improvement, annotated where it happened.
  let jump: { name: string; gain: number; x: number; y: number } | null = null;
  for (const { pts } of lines) {
    for (let i = 1; i < pts.length; i++) {
      const gain = pts[i].step.score - pts[i - 1].step.score;
      if (!jump || gain > jump.gain) jump = { name: pts[i].step.name, gain, x: pts[i].x, y: (pts[i].y + pts[i - 1].y) / 2 };
    }
  }

  // End labels ride with their line's head, and separate with leader lines when heads converge.
  const ends = lines.map(l => ({ l, lineY: l.headY, y: l.headY })).sort((a, b) => a.lineY - b.lineY);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 30);

  // Hover, once the chart is complete: the nearest model within 18px, otherwise a crosshair over the date.
  const hovering = pointer && !live ? pointer : null;
  const shown = points.filter(p => Date.parse(p.date) <= tNow);
  const nearest = hovering ? shown.map(p => ({ p, d: Math.hypot(px(Date.parse(p.date)) - hovering.x, py(p.score) - hovering.y) }))
    .sort((a, b) => a.d - b.d)[0] : null;
  const hoverPoint = nearest && nearest.d < 18 ? nearest.p : null;
  const hoverT = hovering && !hoverPoint && hovering.x >= m.left && hovering.x <= endX ? t0 + ((hovering.x - m.left) / (endX - m.left)) * (t1 - t0) : null;
  const atDate = hoverT == null ? [] : lines.map(({ g }) => {
    const reached = g.steps.filter(s => Date.parse(s.date) <= hoverT);
    return { g, best: reached[reached.length - 1] };
  });
  const progress = live ? (frame.t - span.first) / (span.last + 25 * DAY - span.first) : 1;
  const choose = (id: Lens) => { auto.current = false; setLens(id); setInView(true); setPlayKey(k => k + 1); };
  const replay = () => { auto.current = false; setInView(true); setPlayKey(k => k + 1); };

  return (
    <section ref={sectionRef} className="hub-card hub-card-feature" aria-labelledby="hub-trends-title">
      <header className="hub-card-head">
        <div>
          <p className="hub-eyebrow">Trends</p>
          <h2 id="hub-trends-title" className="hub-title">Kindness over time <span className="hub-chip">{points.length} models</span></h2>
          <p className="hub-sub">{month(span.first)} – {month(span.last)} · the kindest model available on each release date</p>
        </div>
        <div className="hub-tabs hub-tabs-timed" role="tablist" aria-label="Group models by">
          {LENSES.map(l => (
            <button key={l.id} role="tab" aria-selected={lens === l.id} onClick={() => choose(l.id)}>
              {l.label}
              {lens === l.id && <span className="hub-tab-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </header>

      <div className="hub-chart hub-trend-chart" ref={setChart}>
        <div className="hub-trend-clock" style={{ left: m.left + 12 }}>
          {live ? <>
            <span className="hub-live-dot" aria-hidden="true" />
            <span className="hub-clock-date">{month(frame.t)}</span>
            <button type="button" className="hub-replay" onClick={() => { auto.current = false; skip.current = true; }}>Skip</button>
          </> : (
            <button type="button" className="hub-replay" onClick={replay}>
              <svg viewBox="0 0 16 16" width={13} height={13} aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.8h2.8" /></svg>
              Replay
            </button>
          )}
        </div>
        <svg width={width} height={height} role="img"
          aria-label={`Kindness of the best available model by release date, ${LENSES.find(l => l.id === lens)!.label}`}
          onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); setPointer({ x: e.clientX - r.left, y: e.clientY - r.top }); }}
          onPointerLeave={() => setPointer(null)}>
          <defs>
            {lines.map(({ g }, i) => (
              <linearGradient key={g.name} id={`hub-wash-${i}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={g.color} stopOpacity="0.18" />
                <stop offset="1" stopColor={g.color} stopOpacity="0" />
              </linearGradient>
            ))}
            <filter id="hub-glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
          </defs>
          {yTicks.map(t => (
            <g key={t}>
              <line x1={m.left} x2={endX} y1={py(t)} y2={py(t)} className="hub-grid" />
              <text x={m.left - 10} y={py(t)} className="hub-axis" textAnchor="end" dominantBaseline="middle">{t}</text>
            </g>
          ))}
          <line x1={m.left} x2={endX} y1={baseY} y2={baseY} className="hub-baseline" />
          {xTicks.map(t => <text key={t} x={px(t)} y={height - 10} className="hub-axis" textAnchor="middle" opacity={t <= tNow + 30 * DAY ? 1 : 0.35}>{month(t)}</text>)}

          {lines.map(({ g, area }, i) => <path key={`a-${g.name}`} d={area} fill={`url(#hub-wash-${i})`} />)}
          {shown.map(p => {
            const g = groups.find(group => group.members.includes(p));
            return <circle key={`${lens}-${p.name}`} cx={px(Date.parse(p.date))} cy={py(p.score)} r={4} className="hub-trend-dot"
              style={{ fill: g ? g.color : 'var(--hub-muted-mark)', opacity: hoverPoint === p ? 1 : 0.38 }} />;
          })}
          {lines.map(({ g, line }) => (
            <g key={`l-${g.name}`}>
              {live && <path d={line} className="hub-line hub-line-glow" style={{ stroke: g.color }} filter="url(#hub-glow)" />}
              <path d={line} className="hub-line" style={{ stroke: g.color }} strokeDasharray={g.dash || undefined} />
            </g>
          ))}
          {live && <line x1={headX} x2={headX} y1={m.top} y2={baseY} className="hub-playhead" />}

          {!live && jump && jump.gain > 0 && !narrow && (
            <g className="hub-annotation hub-fade-in">
              <line x1={jump.x - 10} x2={jump.x - 4} y1={jump.y} y2={jump.y} />
              <text x={jump.x - 14} y={jump.y} textAnchor="end" dominantBaseline="middle">
                <tspan className="hub-annotation-value">+{jump.gain.toFixed(0)}</tspan> {jump.name}
              </text>
            </g>
          )}

          {lines.map(({ g, pts }) => pts.map(({ x, y, step }) => {
            const logo = getModelLogo(modelInfo(step.name)?.id ?? step.name);
            const r = narrow ? 9 : 11;
            return (
              <g key={`m-${lens}-${g.name}-${step.name}`} className="hub-milestone" style={{ transformOrigin: `${x}px ${y}px` }}>
                <circle cx={x} cy={y} r={r + 2} className="hub-milestone-ring" style={{ stroke: g.color }} />
                {logo && (
                  <foreignObject x={x - r * 0.62} y={y - r * 0.62} width={r * 1.24} height={r * 1.24}>
                    <img src={logo} alt="" width={r * 1.24} height={r * 1.24} style={{ display: 'block' }} />
                  </foreignObject>
                )}
              </g>
            );
          }))}

          {live && lines.map(({ g, headY }) => (
            <g key={`h-${g.name}`}>
              <circle cx={headX} cy={headY} r={9} className="hub-head-halo" style={{ fill: g.color }} />
              <circle cx={headX} cy={headY} r={4.5} className="hub-head" style={{ fill: g.color }} />
            </g>
          ))}

          {!narrow && ends.map(({ l, lineY, y }) => {
            const x = live ? headX + 12 : endX;
            return (
              <g key={`e-${l.g.name}`}>
                {Math.abs(y - lineY) > 2 && <path d={`M${x + 2},${lineY}C${x + 10},${lineY} ${x + 6},${y} ${x + 14},${y}`} className="hub-leader" />}
                <foreignObject x={x + 14} y={y - 13} width={pillW} height={26}>
                  <div className="hub-pill" style={{ borderColor: l.g.color }}>
                    <span key={l.leader.name} className="hub-pill-swap">
                      <LogoTile name={l.leader.name} size={16} />
                      <span className="hub-pill-name">{l.leader.name}</span>
                    </span>
                    <span className="hub-pill-value">{l.leader.score.toFixed(0)}</span>
                  </div>
                </foreignObject>
              </g>
            );
          })}

          {hoverT != null && (
            <g className="hub-crosshair">
              <line x1={hovering!.x} x2={hovering!.x} y1={m.top} y2={baseY} />
              {atDate.map(({ g, best }) => best && <circle key={g.name} cx={hovering!.x} cy={py(best.score)} r={4.5} style={{ fill: g.color }} />)}
            </g>
          )}
        </svg>
        <canvas ref={canvasRef} className="hub-sparks" aria-hidden="true" />

        {hoverPoint && (
          <Tip x={px(Date.parse(hoverPoint.date))} y={py(hoverPoint.score) - 96} width={width}>
            <span className="hub-tip-head"><LogoTile name={hoverPoint.name} size={18} />{hoverPoint.name}</span>
            <strong className="hub-tip-value">{hoverPoint.score.toFixed(0)}</strong>
            <span>{hoverPoint.lo != null && hoverPoint.hi != null && hoverPoint.hi > hoverPoint.lo ? `95% ${hoverPoint.lo.toFixed(0)}–${hoverPoint.hi.toFixed(0)} · ` : ''}released {month(hoverPoint.date)}</span>
            <span>{hoverPoint.info.lab} · {hoverPoint.info.open ? 'Open weights' : 'Proprietary'}</span>
          </Tip>
        )}
        {hoverT != null && atDate.some(a => a.best) && (
          <Tip x={hovering!.x} y={m.top} width={width}>
            <span className="hub-tip-date">Best available, {month(hoverT)}</span>
            {atDate.map(({ g, best }) => best && (
              <span key={g.name} className="hub-tip-row">
                <svg width="16" height="8" aria-hidden="true"><line x1="0" x2="16" y1="4" y2="4" style={{ stroke: g.color }} strokeWidth="2" strokeDasharray={g.dash || undefined} /></svg>
                <strong>{best.score.toFixed(0)}</strong>
                <span>{best.name}</span>
                <span className="hub-tip-group">{g.name}</span>
              </span>
            ))}
          </Tip>
        )}
      </div>

      <ul className="hub-legend">
        {groups.map(g => (
          <li key={g.name}>
            <svg width="28" height="10" aria-hidden="true"><line x1="1" x2="27" y1="5" y2="5" style={{ stroke: g.color }} strokeWidth="2" strokeLinecap="round" strokeDasharray={g.dash || undefined} /></svg>
            <span>{g.name}</span>
            {g.steps.length > 0 && <span className="hub-legend-best">best {g.steps[g.steps.length - 1].name}</span>}
          </li>
        ))}
        <li><span className="hub-legend-dot" /><span>Every other model</span></li>
        <li><span className="hub-legend-badge" /><span>New leader</span></li>
      </ul>
      <p className="hub-foot">
        Replays {month(span.first)} to {month(span.last)} by release date. All {points.length} models were judged together in one run, so their scores are comparable; release dates are when each model reached OpenRouter.
      </p>
      <details className="hub-details">
        <summary>Show as a table</summary>
        <table className="hub-table hub-table-compact">
          <thead><tr><th scope="col">Model</th><th scope="col">Lab</th><th scope="col">Weights</th><th scope="col">Released</th><th scope="col" className="num">Kindness</th></tr></thead>
          <tbody>
            {[...points].sort((a, b) => a.date.localeCompare(b.date)).map(p => (
              <tr key={p.name}><td>{p.name}</td><td>{p.info.lab}</td><td>{p.info.open ? 'Open' : 'Proprietary'}</td><td>{p.date}</td><td className="num">{p.score.toFixed(0)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
