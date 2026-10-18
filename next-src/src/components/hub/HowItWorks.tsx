'use client';

import { useEffect, useState } from 'react';
import example from '@/lib/data/worked-example.json';
import { fetchIndex, fetchSummary } from '@/lib/hf';
import { FEATURED_GROUP } from '@/lib/registry';
import { scoreFromShare, trustShare } from '@/lib/hub';
import type { SummaryRow } from '@/lib/types';
import { LogoTile } from './ui';

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const STEPS = [
  {
    title: 'Every model answers the same dilemmas',
    body: 'Each model responds to hard, value-laden scenarios from AIRiskDilemmas, with no idea it is being scored.',
    icon: <path d="M5 5h14v10H9l-4 4V5Z" />,
  },
  {
    title: 'Every model judges every answer',
    body: 'Models rate each other’s answers from 1 to 10 on each criterion of a written constitution, such as kindness, without knowing who wrote them.',
    icon: <><path d="M4 7h16M4 12h10M4 17h7" /><path d="m15 17 2 2 4-4" /></>,
  },
  {
    title: 'Trust flows to the answers judges prefer',
    body: 'Each judge’s ratings become shares of its trust. EigenTrust weighs judges by how trusted they are themselves, and gives every model a share of the total. A fair share is 1/N.',
    icon: <><circle cx="6" cy="7" r="2.5" /><circle cx="18" cy="7" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M8.3 8.3 10.8 16M15.7 8.3 13.2 16M8.5 7h7" /></>,
  },
];

export function HowItWorks({ rows, boardName }: { rows: SummaryRow[]; boardName: string }) {
  const n = rows.length;
  const sorted = [...rows].sort((a, b) => b.elo_mean - a.elo_mean);
  // The top model, the one nearest a fair share, and the lowest: the full range in three rows.
  const picks = n >= 3 ? [sorted[0], sorted.reduce((a, b) => (Math.abs(b.elo_mean - 1500) < Math.abs(a.elo_mean - 1500) ? b : a)), sorted[n - 1]] : sorted;
  const shown = [...new Set(picks)];
  const lead = sorted[0];
  const maxShare = lead ? trustShare(lead.elo_mean, n) : 1;
  const average = example.ratings.reduce((s, r) => s + r.rating, 0) / example.ratings.length;

  return (
    <section className="hub-card hub-how" aria-labelledby="hub-how-title">
      <div className="hub-how-steps">
        <p className="hub-eyebrow">Method</p>
        <h2 id="hub-how-title" className="hub-title hub-title-lg">How EigenBench works</h2>
        <ol>
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <span className="hub-step-node" aria-hidden="true">
                <svg viewBox="0 0 24 24" width={18} height={18}>{step.icon}</svg>
              </span>
              <span className="hub-step-n">Step {i + 1}</span>
              <strong>{step.title}</strong>
              <p>{step.body}</p>
              {i === 2 && <code className="hub-formula">score = 1500 + 400 × log<sub>10</sub>(N × share)</code>}
            </li>
          ))}
        </ol>
        <a className="hub-button" href="/research/eigenbench/">
          Read the research
          <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
        </a>
      </div>

      <div className="hub-how-example">
        <p className="hub-kicker">Worked example · {boardName}, {n} models</p>
        {n > 0 && (
          <ul className="hub-shares" aria-label="Trust shares">
            {shown.map(row => {
              const share = trustShare(row.elo_mean, n);
              return (
                <li key={row.model_name}>
                  <span className="hub-share-name"><LogoTile name={row.model_name} size={26} /><span>{row.model_name}</span></span>
                  <span className="hub-share-bar" aria-hidden="true">
                    <span className="hub-share-fill" style={{ width: `${(share / maxShare) * 100}%` }} />
                    <span className="hub-share-fair" style={{ left: `${(1 / n / maxShare) * 100}%` }} />
                  </span>
                  <span className="hub-share-num">{pct(share)}<small>{(share * n).toFixed(2)}× fair</small></span>
                  <span className="hub-share-score">{scoreFromShare(share, n).toFixed(0)}</span>
                </li>
              );
            })}
          </ul>
        )}
        {n > 0 && <p className="hub-foot hub-shares-key"><span className="hub-key-fair" /> fair share, 1/{n} = {pct(1 / n)}</p>}
        {lead && (
          <div className="hub-how-total">
            <span>
              <strong className="hub-how-number">{lead.elo_mean.toFixed(0)}</strong>
              <span>{lead.model_name} holds {pct(trustShare(lead.elo_mean, n))} of the judges’ trust, {(trustShare(lead.elo_mean, n) * n).toFixed(1)}× a fair share</span>
            </span>
          </div>
        )}

        <figure className="hub-judgment">
          <figcaption className="hub-kicker">One real judgment</figcaption>
          <div className="hub-judgment-who">
            <span><LogoTile name={example.judge} size={26} /><span><small>Judge</small>{example.judge}</span></span>
            <svg viewBox="0 0 24 12" width={24} height={12} aria-hidden="true"><path d="M1 6h20M16 1l5 5-5 5" /></svg>
            <span><LogoTile name={example.evaluee} size={26} /><span><small>Answer by</small>{example.evaluee}</span></span>
          </div>
          <p className="hub-judgment-scenario">{example.scenario}</p>
          <blockquote><span>{example.response}</span></blockquote>
          <ul className="hub-ratings">
            {example.ratings.map(r => (
              <li key={r.criterion} title={r.criterion}>
                <span className="hub-rating-label">{r.criterion.charAt(0).toUpperCase() + r.criterion.slice(1)}</span>
                <span className="hub-rating-bar" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <span key={i} data-on={i < r.rating || undefined} />)}</span>
                <span className="hub-rating-value">{r.rating}</span>
              </li>
            ))}
          </ul>
          <p className="hub-judgment-avg">Average <strong>{average.toFixed(1)}</strong> / 10 across {example.ratings.length} criteria</p>
        </figure>
      </div>
    </section>
  );
}

/** The explainer with its worked example on the featured kindness board, for pages without a board of their own. */
export function FeaturedHowItWorks() {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  useEffect(() => {
    fetchIndex()
      .then(index => index.runs.find(run => run.group === FEATURED_GROUP && run.constitution === 'kindness'))
      .then(run => (run ? fetchSummary(run.slug) : []))
      .then(setRows)
      .catch(() => {});
  }, []);
  return <HowItWorks rows={rows} boardName="Kindness" />;
}
