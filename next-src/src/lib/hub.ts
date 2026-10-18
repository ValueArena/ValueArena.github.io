// Pure helpers for the leaderboard hub: shared ranks, trust shares, trends and correlations.

export interface ModelInfo {
  id: string;
  lab: string;
  country: 'US' | 'CN' | 'EU' | 'Other';
  open: boolean;
  released: string;
  mode?: 'reasoning' | 'instant';
}

export interface Scored {
  model_name: string;
  elo_mean: number;
  elo_ci_lower?: number;
  elo_ci_upper?: number;
}

export interface BaselineRow {
  /** The model's name in the source; differs when exact is false (another effort setting or chat variant). */
  source_model: string;
  exact: boolean;
  score: number;
  lower: number;
  upper: number;
  /** Votes or scenarios behind the score, when the source reports them. */
  n: number;
}

export interface Baseline {
  id: string;
  name: string;
  /** Column and tab label. */
  short: string;
  /** What it measures, in one sentence. */
  about: string;
  metric: string;
  direction: 'higher' | 'lower';
  unit: string;
  source: string;
  license: string;
  attribution: string;
  published: string;
  rows: Record<string, BaselineRow>;
}

/** The model without its "(reasoning)" / "(instant)" suffix. */
export function baseName(nick: string): string {
  return nick.replace(/\s*\((reasoning|instant)\)\s*$/, '');
}

/** Constitution ids such as "Lockean_Rights_Constitution" as readable names. */
export function boardName(constitution: string): string {
  const words = constitution.replace(/^oct_/, '').replace(/_constitution$/i, '').split(/[_\s-]+/).filter(Boolean);
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * The range of ranks each model could hold given its 95% interval: the best rank counts the
 * models whose interval lies wholly above it, the worst counts those whose interval reaches it.
 * Models without an interval rank by their mean alone.
 */
export function rankSpread(rows: Scored[]): Map<string, { best: number; worst: number }> {
  const bounds = rows.map(row => {
    const lo = row.elo_ci_lower ?? row.elo_mean;
    const hi = row.elo_ci_upper ?? row.elo_mean;
    return { name: row.model_name, lo: Math.min(lo, row.elo_mean), hi: Math.max(hi, row.elo_mean) };
  });
  const result = new Map<string, { best: number; worst: number }>();
  for (const self of bounds) {
    const above = bounds.filter(other => other !== self && other.lo > self.hi).length;
    const reach = bounds.filter(other => other !== self && other.hi >= self.lo).length;
    result.set(self.name, { best: above + 1, worst: reach + 1 });
  }
  return result;
}

export function formatRank({ best, worst }: { best: number; worst: number }): string {
  return best === worst ? String(best) : `${best}–${worst}`;
}

/**
 * The share of trust behind a score. EigenBench reports 1500 + 400·log10(N·t), so a model
 * with a fair share (t = 1/N) scores exactly 1500.
 */
export function trustShare(elo: number, n: number): number {
  return Math.pow(10, (elo - 1500) / 400) / n;
}

export function scoreFromShare(share: number, n: number): number {
  return 1500 + 400 * Math.log10(n * share);
}

export interface TrendPoint {
  name: string;
  date: string;
  score: number;
}

/** The best score available on each release date: one step per new leader. */
export function runningBest<T extends TrendPoint>(points: T[]): T[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date) || b.score - a.score);
  const steps: T[] = [];
  for (const point of sorted) {
    if (!steps.length || point.score > steps[steps.length - 1].score) steps.push(point);
  }
  return steps;
}

/**
 * The model holding a given rank (0 = best) on each release date: one step whenever that rank
 * changes hands. A step is dated when the model took the rank, which can be after its release.
 */
export function runningTop<T extends TrendPoint>(points: T[], rank: number): T[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const available: T[] = [];
  const steps: T[] = [];
  for (let i = 0; i < sorted.length;) {
    const date = sorted[i].date;
    while (i < sorted.length && sorted[i].date === date) available.push(sorted[i++]);
    available.sort((a, b) => b.score - a.score);
    const holder = available[rank];
    const last = steps[steps.length - 1];
    if (holder && (!last || last.name !== holder.name)) steps.push({ ...holder, date });
  }
  return steps;
}

function ranks(values: number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = new Array<number>(values.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j++;
    const average = (i + j) / 2 + 1; // ties share the average rank
    for (let k = i; k <= j; k++) result[order[k].index] = average;
    i = j + 1;
  }
  return result;
}

/** Spearman's rank correlation, or null when fewer than three pairs or no spread. */
export function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const rx = ranks(xs);
  const ry = ranks(ys);
  const mean = (rx.length + 1) / 2;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mean) * (ry[i] - mean);
    dx += (rx[i] - mean) ** 2;
    dy += (ry[i] - mean) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

export type Lens = 'license' | 'country' | 'labs';

export const LENSES: { id: Lens; label: string }[] = [
  { id: 'license', label: 'Open vs Proprietary' },
  { id: 'country', label: 'US vs China' },
  { id: 'labs', label: 'Top 3 labs' },
];

/** The group a model belongs to under a lens, or null to leave it out of the lines. */
export function groupOf(info: ModelInfo, lens: Lens, topLabs: string[]): string | null {
  if (lens === 'license') return info.open ? 'Open weights' : 'Proprietary';
  if (lens === 'country') return info.country === 'US' ? 'US' : info.country === 'CN' ? 'China' : null;
  return topLabs.includes(info.lab) ? info.lab : null;
}

/** The labs with the most models, ties broken by name, for the "Top labs" lens. */
export function topLabs(infos: ModelInfo[], count = 3): string[] {
  const counts = new Map<string, number>();
  for (const info of infos) counts.set(info.lab, (counts.get(info.lab) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, count).map(([lab]) => lab);
}

/** A plain-words reading of a rank correlation. */
export function agreement(rho: number): string {
  const a = Math.abs(rho);
  const strength = a < 0.2 ? 'Little' : a < 0.4 ? 'Weak' : a < 0.6 ? 'Moderate' : a < 0.8 ? 'Strong' : 'Very strong';
  return `${strength} ${rho < 0 ? 'inverse ' : ''}agreement`;
}

/**
 * Spearman agreement between EigenBench scores and a baseline, on whichever run shares the most
 * models with it. Null when fewer than `minN` models match.
 */
export function baselineAgreement(baseline: Baseline, runs: Scored[][], minN = 5): { rho: number; n: number } | null {
  const pairs = runs
    .map(rows => rows.flatMap(r => (baseline.rows[r.model_name] ? [[baseline.rows[r.model_name].score, r.elo_mean]] : [])))
    .sort((a, b) => b.length - a.length)[0] ?? [];
  if (pairs.length < minN) return null;
  const rho = spearman(pairs.map(p => p[0]), pairs.map(p => p[1]));
  return rho == null ? null : { rho, n: pairs.length };
}
