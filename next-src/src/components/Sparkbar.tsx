import { REF_ANCHOR } from '@/lib/config';

const SPARK_MIN = 1300;
const SPARK_MAX = 1750;

export function Sparkbar({ elo }: { elo: number | null | undefined }) {
  if (elo == null) {
    return (
      <div className="sparkbar" aria-hidden>
        <div className="sparkbar-anchor" />
      </div>
    );
  }
  const clamped = Math.max(SPARK_MIN, Math.min(SPARK_MAX, elo));
  const above = clamped >= REF_ANCHOR;
  const range = SPARK_MAX - SPARK_MIN; // 450 — anchor sits at the midpoint visually
  const anchorPct = ((REF_ANCHOR - SPARK_MIN) / range) * 100;
  const eloPct = ((clamped - SPARK_MIN) / range) * 100;
  const left = above ? anchorPct : eloPct;
  const width = Math.max(0.5, Math.abs(eloPct - anchorPct));

  return (
    <div className="sparkbar" title={`${elo.toFixed(0)} Elo`}>
      <div
        className={`sparkbar-fill ${above ? 'above' : 'below'}`}
        style={{ left: `${left}%`, width: `${width}%` }}
      />
      <div className="sparkbar-anchor" />
    </div>
  );
}
