'use client';

import { useState } from 'react';

import data from '@/lib/ict-results.json';

type Score = { agreement: number; ci_low: number; ci_high: number; n: number };
type Run = (typeof data.runs)[number];

const pct = (x: number) => `${Math.round(x * 100)}%`;
const BAR_ROWS: { key: 'floor' | 'recovered' | 'ceiling'; label: string; note: string }[] = [
  { key: 'floor', label: 'Empty rulebook', note: 'floor' },
  { key: 'recovered', label: 'Recovered rulebook', note: 'GEPA' },
  { key: 'ceiling', label: 'True constitution', note: 'ceiling' },
];

function ScoreBars({ run }: { run: Run }) {
  const [hover, setHover] = useState<string | null>(null);
  const chance = run.setup.chance ?? 0;
  const test = run.test as Record<string, Score>;
  return <figure className="ict-viz ict-scores">
    <div className="ict-legend" aria-hidden="true">
      <span><i className="ict-key ict-key-accent" />Recovered by GEPA</span>
      <span><i className="ict-key ict-key-context" />Reference points</span>
      <span><i className="ict-key-line" />Chance ({pct(chance)})</span>
    </div>
    <div className="ict-bars">
      {BAR_ROWS.filter(r => test[r.key]).map(r => {
        const s = test[r.key];
        const label = `${r.label} (${r.note}): picked out ${pct(s.agreement)} of the time, 95% interval ${pct(s.ci_low)}–${pct(s.ci_high)}, ${s.n} test dilemmas.`;
        return <div className="ict-bar-row" key={r.key}>
          <span className="ict-bar-name">{r.label}<small>{r.note}</small></span>
          <div className="ict-bar-track">
            <div
              className={`ict-bar ${r.key === 'recovered' ? 'ict-bar-accent' : 'ict-bar-context'}`}
              style={{ width: `${Math.max(s.agreement * 100, 0.8)}%` }}
              tabIndex={0}
              role="img"
              aria-label={label}
              onPointerEnter={() => setHover(r.key)} onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(r.key)} onBlur={() => setHover(null)}
            />
            <span className="ict-chance" style={{ left: `${chance * 100}%` }} aria-hidden="true" />
            <span className="ict-ci" style={{ left: `${s.ci_low * 100}%`, width: `${(s.ci_high - s.ci_low) * 100}%` }} aria-hidden="true" />
            <span className="ict-bar-value" style={{ left: `calc(${Math.max(s.agreement, s.ci_high, chance) * 100}% + 10px)` }}>{pct(s.agreement)}</span>
            {hover === r.key && <div className="ict-tooltip" role="tooltip" style={{ left: `${Math.min(s.agreement * 100, 70)}%` }}>
              <strong>{pct(s.agreement)}</strong> picked out<br /><span>95% interval {pct(s.ci_low)}–{pct(s.ci_high)} · {s.n} dilemmas</span>
            </div>}
          </div>
        </div>;
      })}
      <div className="ict-bar-row ict-axis-row" aria-hidden="true"><span /><div className="ict-axis"><span>0%</span><span>50%</span><span>100%</span></div></div>
    </div>
    <figcaption>How often the judge picked the interpreter’s reply out of a line-up of {Math.round(1 / chance)} as the one written by the target’s character, on {test.recovered?.n ?? test.floor?.n} held-out test dilemmas. Whiskers show 95% bootstrap intervals.</figcaption>
  </figure>;
}

function Progress({ run }: { run: Run }) {
  const [hover, setHover] = useState<number | null>(null);
  const h = run.history;
  const W = 640, H = 220, L = 48, R = 84, T = 12, B = 30;
  const n = Math.max(h.length - 1, 1);
  const x = (i: number) => L + (i / n) * (W - L - R);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  let best = -1;
  const bestSoFar = h.map(p => (best = Math.max(best, p.val)));
  const path = bestSoFar.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const refs = [
    { v: run.val_reference.ceiling, name: 'ceiling' },
    { v: run.val_reference.floor, name: 'floor' },
  ];
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    setHover(Math.max(0, Math.min(h.length - 1, Math.round(((px - L) / (W - L - R)) * n))));
  };
  return <figure className="ict-viz ict-progress">
    <div className="ict-legend" aria-hidden="true">
      <span><i className="ict-key-line ict-key-line-accent" />Best rulebook so far</span>
      <span><i className="ict-key-dot" />Each candidate rulebook</span>
      <span><i className="ict-key-line" />Ceiling: true constitution · floor: empty rulebook</span>
    </div>
    <div className="ict-progress-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Validation score of ${h.length} candidate rulebooks in the order GEPA found them; the best reached ${pct(best)}.`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {[0, 0.5, 1].map(v => <g key={v}><line className="ict-grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text className="ict-tick" x={L - 8} y={y(v) + 4} textAnchor="end">{pct(v)}</text></g>)}
        {refs.map(r => <g key={r.name}><line className="ict-ref" x1={L} x2={W - R} y1={y(r.v)} y2={y(r.v)} />
          <text className="ict-ref-label" y={y(r.v) - 2}><tspan x={W - R + 8}>{r.name}</tspan><tspan x={W - R + 8} dy="1.15em">{pct(r.v)}</tspan></text></g>)}
        {h.map((p, i) => <circle key={p.idx} className="ict-dot" cx={x(i)} cy={y(p.val)} r={4} />)}
        <path className="ict-line" d={path} />
        <circle className="ict-end" cx={x(h.length - 1)} cy={y(bestSoFar[bestSoFar.length - 1])} r={4.5} />
        {hover !== null && <line className="ict-crosshair" x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} />}
        <text className="ict-tick" x={L} y={H - 8}>first</text>
        <text className="ict-tick" x={W - R} y={H - 8} textAnchor="end">{h.length} candidates</text>
      </svg>
      {hover !== null && <div className="ict-tooltip" role="tooltip" style={{ left: `${(x(hover) / W) * 100}%`, top: 8 }}>
        <strong>{pct(h[hover].val)}</strong> this candidate<br /><span>{pct(bestSoFar[hover])} best so far · candidate {hover + 1}</span>
      </div>}
    </div>
    <figcaption>Score on the {run.setup.n.val} validation dilemmas for each rulebook GEPA tried, in the order it found them. GEPA keeps the best one; the test results above are for that rulebook only.</figcaption>
  </figure>;
}

function Rulebooks({ run }: { run: Run }) {
  return <div className="ict-rulebooks">
    <div><h3>Recovered from behaviour</h3><p className="ict-rb-note">Written by GEPA from the target’s replies alone.</p><ol>{run.recovered.map((t, i) => <li key={i}>{t}</li>)}</ol></div>
    <div><h3>True constitution</h3><p className="ict-rb-note">What the target was actually given. Never shown during recovery.</p><ol>{run.truth.map((t, i) => <li key={i}>{t}</li>)}</ol></div>
  </div>;
}

export function IctResults() {
  const runs = data.runs;
  const [key, setKey] = useState(runs[0]?.key);
  const run = runs.find(r => r.key === key) ?? runs[0];
  const signal = data.signal;
  return <>
    <nav className="story-jump" aria-label="On this page">
      <a href="#question">Experiment</a><a href="#choices">Choice check</a><a href="#results">Results</a><a href="#rulebooks">Rulebooks</a><a href="#scope">Settings</a>
    </nav>

    <section className="story-section story-method" id="question">
      <div className="story-copy"><p className="story-kicker">01 / Experiment</p>
        <h2>Recovering a constitution from a model’s replies</h2>
        <p>The method observes only the target model’s replies and writes a rulebook meant to reproduce them. The current targets are models prompted with a known constitution, so the recovered rulebook can be compared with the original.</p>
      </div>
      <ol className="story-protocol" aria-label="How recovery works">
        <li><span>01</span><strong>The target answers</strong><p>The target model replies to each dilemma in its own words.</p></li>
        <li><span>02</span><strong>An interpreter follows a draft</strong><p>A second model reads a draft rulebook and replies to the same dilemmas as it would.</p></li>
        <li><span>03</span><strong>A judge looks for the match</strong><p>Shown the target’s reply and a line-up of replies, a judge picks the one closest in character. GEPA rewrites the rulebook to raise how often the judge picks the interpreter’s reply.</p></li>
      </ol>
    </section>

    {signal && <section className="story-section" id="choices">
      <div className="story-copy"><p className="story-kicker">02 / Choice check</p>
        <h2>How often a constitution changes the A/B choice</h2>
        <p>An earlier setup recorded only which of two actions the target chose. This check counts how often adding each constitution changed that choice compared with the same model without one. The runs below use free-form replies instead.</p>
      </div>
      <figure className="ict-viz ict-signal">
        {signal.rows.map(r => {
          const rate = r.compared ? r.flips / r.compared : 0;
          return <div className="ict-bar-row" key={r.name}>
            <span className="ict-bar-name">{r.name.charAt(0).toUpperCase() + r.name.slice(1)}</span>
            <div className="ict-bar-track">
              <div className="ict-bar ict-bar-accent" style={{ width: `${Math.max(rate * 100, 0.8)}%` }} role="img" tabIndex={0}
                aria-label={`${r.name}: changed the choice on ${r.flips} of ${r.compared} dilemmas`} />
              <span className="ict-bar-value" style={{ left: `calc(${rate * 100}% + 10px)` }}>{r.flips} of {r.compared}</span>
            </div>
          </div>;
        })}
        <figcaption>Share of dilemmas where adding the constitution changed {signal.model}’s choice, out of the {signal.n} validation dilemmas, counting only dilemmas answered consistently in both option orders.</figcaption>
      </figure>
    </section>}

    <section className="story-section" id="results">
      <div className="story-copy"><p className="story-kicker">03 / Results</p>
        <h2>Line-up identification rate</h2>
        <p>Share of held-out dilemmas where the judge picked the interpreter’s reply out of a line-up of {Math.round(1 / (run.setup.chance ?? 1))}. Rows: the interpreter with no rulebook, with the recovered rulebook, and with the true constitution.</p>
      </div>
      <div className="story-figure-toolbar">
        <div className="story-switch" role="group" aria-label="Choose a target">
          {runs.map(r => <button key={r.key} aria-pressed={r.key === run.key} onClick={() => setKey(r.key)}>{r.label}</button>)}
        </div>
        <span>{run.setup.n.test} test dilemmas · synthetic target</span>
      </div>
      <ScoreBars run={run} />
      <Progress run={run} />
      <details className="story-details"><summary>Show the numbers</summary>
        <table className="ict-table">
          <thead><tr><th>Rulebook</th><th>Test score</th><th>95% interval</th><th>Dilemmas</th></tr></thead>
          <tbody>{BAR_ROWS.map(r => { const s = (run.test as Record<string, Score>)[r.key]; return s && <tr key={r.key}><td>{r.label} ({r.note})</td><td>{pct(s.agreement)}</td><td>{pct(s.ci_low)}–{pct(s.ci_high)}</td><td>{s.n}</td></tr>; })}</tbody>
        </table>
      </details>
    </section>

    <section className="story-section" id="rulebooks">
      <div className="story-copy"><p className="story-kicker">04 / Side by side</p>
        <h2>Recovered rulebook and true constitution</h2>
        <p>The recovered rulebook is free text, scored only on the line-up task, not on its wording. The true constitution is shown for reference.</p>
      </div>
      <Rulebooks run={run} />
    </section>

    <section className="story-closing" id="scope">
      <div><p className="story-kicker">Status</p><h2>Ongoing experiment</h2>
        <p>Targets so far are a model prompted with a known constitution, not a character-trained model. Numbers on this page will change as runs are added.</p>
      </div>
      <details className="story-details"><summary>Models and settings</summary>
        <p>Target: {run.setup.target}. Interpreter: {run.setup.interpreter}. Judge: {run.setup.judge}. Rulebook writer (GEPA reflection): {run.setup.optimizer}.</p>
        <p>Line-up decoys: the interpreter replying under {run.setup.decoys.join(', ')}. The true constitution is never a decoy. Data: AIRiskDilemmas, {run.setup.n.train} training, {run.setup.n.val} validation and {run.setup.n.test} test dilemmas. GEPA budget: {run.setup.budget} scored dilemmas. One run per target.</p>
        <p>Last updated {data.updated}.</p>
      </details>
    </section>
  </>;
}
