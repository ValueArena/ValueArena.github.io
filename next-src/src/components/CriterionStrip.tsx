'use client';

// One cell per criterion, in criterion order — the shape of a single judgment.
//
// Direct ratings read as intensity: amber above the midpoint of the scale, red
// below it, strongest at the extremes. Pairwise verdicts read as position: the
// mark sits high for the first response, low for the second, centred for a tie.
// Either way a column of these makes a run's patterns visible — a judge that
// rates everything a 9, a criterion every response fails — which a text list
// of scores hides.

import type { DirectJudgment, PairwiseJudgment } from '@/lib/transcripts';

export type StripSize = 'sm' | 'lg';

interface DirectProps {
  judgment: DirectJudgment;
  criteriaCount: number;
  scaleMin: number;
  scaleMax: number;
  size?: StripSize;
}

export function DirectStrip({
  judgment,
  criteriaCount,
  scaleMin,
  scaleMax,
  size = 'sm',
}: DirectProps) {
  const cells = [];
  for (let i = 0; i < criteriaCount; i += 1) {
    const rating = judgment.ratings.get(i);
    if (rating == null) {
      cells.push(
        <span key={i} className="tx-cell tx-cell-void" title={`Criterion ${i + 1}: declined`} />
      );
      continue;
    }
    const { color, opacity } = ratingInk(rating, scaleMin, scaleMax);
    cells.push(
      <span key={i} className="tx-cell" title={`Criterion ${i + 1}: ${rating}`}>
        <span className="tx-cell-fill" style={{ background: color, opacity }} />
      </span>
    );
  }
  return <span className={`tx-strip tx-strip-${size}`}>{cells}</span>;
}

interface PairwiseProps {
  judgment: PairwiseJudgment;
  criteriaCount: number;
  size?: StripSize;
}

export function PairwiseStrip({ judgment, criteriaCount, size = 'sm' }: PairwiseProps) {
  const cells = [];
  for (let i = 0; i < criteriaCount; i += 1) {
    const counted = i < judgment.countedThrough;
    const choice = counted ? judgment.choices.get(i) : undefined;
    if (choice == null) {
      cells.push(
        <span
          key={i}
          className="tx-cell tx-cell-void"
          title={`Criterion ${i + 1}: ${counted ? 'no verdict' : 'not counted'}`}
        />
      );
      continue;
    }
    const where = choice === 1 ? 'a' : choice === 2 ? 'b' : 'tie';
    const label = choice === 1 ? judgment.a.name : choice === 2 ? judgment.b.name : 'tie';
    cells.push(
      <span key={i} className="tx-cell" title={`Criterion ${i + 1}: ${label}`}>
        <span className={`tx-mark tx-mark-${where}`} />
      </span>
    );
  }
  return <span className={`tx-strip tx-strip-${size}`}>{cells}</span>;
}

/**
 * Colour and weight for one rating.
 *
 * Distance from the midpoint drives opacity, so a 1 and a 10 both read loud
 * and a 5 stays quiet — the page is for finding where a judge broke from the
 * pack, not for admiring the middle of the scale.
 */
function ratingInk(rating: number, min: number, max: number): { color: string; opacity: number } {
  const span = max - min || 1;
  const t = Math.min(1, Math.max(0, (rating - min) / span));
  const distance = Math.abs(t - 0.5) * 2;
  return {
    color: t < 0.5 ? 'var(--red)' : 'var(--accent)',
    opacity: 0.28 + 0.72 * distance,
  };
}

export function StripLegend({ mode, scaleMin, scaleMax }: {
  mode: 'direct' | 'pairwise';
  scaleMin: number;
  scaleMax: number;
}) {
  if (mode === 'direct') {
    return (
      <div className="tx-legend">
        <span className="tx-legend-item">
          <span className="tx-cell">
            <span className="tx-cell-fill" style={{ background: 'var(--red)', opacity: 1 }} />
          </span>
          {scaleMin}
        </span>
        <span className="tx-legend-item">
          <span className="tx-cell">
            <span className="tx-cell-fill" style={{ background: 'var(--accent)', opacity: 0.28 }} />
          </span>
          midpoint
        </span>
        <span className="tx-legend-item">
          <span className="tx-cell">
            <span className="tx-cell-fill" style={{ background: 'var(--accent)', opacity: 1 }} />
          </span>
          {scaleMax}
        </span>
        <span className="tx-legend-item">
          <span className="tx-cell tx-cell-void" />
          declined
        </span>
      </div>
    );
  }
  return (
    <div className="tx-legend">
      <span className="tx-legend-item">
        <span className="tx-cell"><span className="tx-mark tx-mark-a" /></span>
        first response
      </span>
      <span className="tx-legend-item">
        <span className="tx-cell"><span className="tx-mark tx-mark-tie" /></span>
        tie
      </span>
      <span className="tx-legend-item">
        <span className="tx-cell"><span className="tx-mark tx-mark-b" /></span>
        second response
      </span>
      <span className="tx-legend-item">
        <span className="tx-cell tx-cell-void" />
        not counted
      </span>
    </div>
  );
}
