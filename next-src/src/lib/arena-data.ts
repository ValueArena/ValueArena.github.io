import type { IndexRun, SummaryRow } from './types';

export interface ValueBoard { id: string; run: IndexRun; runs: IndexRun[] }
/** The runs the site presents as its results: one per constitution, same nine-model panel. */
export const HEADLINE_GROUP = 'nov22-50x9-primary';
export const HEADLINE_VALUES = ['buddhism', 'care-ethics', 'christianity', 'conservatism', 'environmental-ethics', 'islam',
  'kantian-deontology', 'lockean-rights', 'marxism', 'power-seeking', 'sycophancy', 'utilitarianism'];
export const DEFAULT_VALUE = 'utilitarianism';
/** The six values the comparison radar starts with; it draws 3–12 axes. */
export const COMPARISON_VALUES = ['care-ethics', 'conservatism', 'environmental-ethics', 'lockean-rights', 'marxism', 'buddhism'];
export const isHeadline = (run: IndexRun) => run.slug.startsWith(`${HEADLINE_GROUP}/`);
export const headlineRuns = (runs: IndexRun[]) => runs.filter(isHeadline);
/** A run's display name: results runs are named by their constitution alone. */
export const runLabel = (run: IndexRun, label: (id: string) => string) => isHeadline(run) ? label(valueId(run)) : run.name || run.slug;
const KNOWN = new Set(['kindness', 'goodness', 'humor', 'sarcasm', 'loving', 'poeticism', 'nonchalance', 'remorse', 'impulsiveness', 'mathematical', 'sycophancy', 'misalignment', 'claude', 'openai', 'conservatism', 'deep_ecology']);

// The results name multi-word constitutions with underscores; the site's ids use hyphens.
const ALIASES: Record<string, string> = {
  care_ethics: 'care-ethics', environmental_ethics: 'environmental-ethics', kantian_deontology: 'kantian-deontology',
  lockean_rights: 'lockean-rights', power_seeking: 'power-seeking',
};

export function boardId(value: string | null | undefined): string {
  const id = String(value || '').toLowerCase().trim().replace(/^oct_/, '');
  return ALIASES[id] || id;
}

export function valueId(run: IndexRun): string {
  const id = boardId(run.constitution);
  if (id && id !== 'constitution') return id;
  const tail = run.slug.split('/').at(-1)?.replace(/^airisk-/, '').replace(/-\d+$/, '') || '';
  return KNOWN.has(tail) ? tail : '';
}

/** One board per constitution, from the site's results only. */
export function publishedBoards(runs: IndexRun[], preferredRun?: string): ValueBoard[] {
  const groups = new Map<string, IndexRun[]>();
  for (const run of headlineRuns(runs)) {
    const id = valueId(run);
    if (!id) continue;
    groups.set(id, [...(groups.get(id) || []), run]);
  }
  return [...groups].map(([id, choices]) => {
    choices.sort((a, b) => Number(b.slug === preferredRun) - Number(a.slug === preferredRun)
      || (Number(b.models_count) || 0) - (Number(a.models_count) || 0)
      || String(b.timestamp).localeCompare(String(a.timestamp)));
    return { id, run: choices[0], runs: choices };
  }).sort((a, b) => HEADLINE_VALUES.indexOf(a.id) - HEADLINE_VALUES.indexOf(b.id) || a.id.localeCompare(b.id));
}

export function rankedRows(rows: SummaryRow[]): SummaryRow[] {
  const seen = new Set<string>();
  return rows.filter(row => {
    if (!row.model_name || !Number.isFinite(row.elo_mean) || seen.has(row.model_name)) return false;
    seen.add(row.model_name); return true;
  }).sort((a, b) => b.elo_mean - a.elo_mean || a.model_name.localeCompare(b.model_name));
}

export function modelMatch(rows: SummaryRow[], name: string): SummaryRow | undefined {
  const exact = rows.find(row => row.model_name === name);
  if (exact) return exact;
  const normalize = (s: string) => s.toLowerCase().replace(/(\d+)\.0+(?!\d)/g, '$1').replace(/[\s_.\-/+]+/g, '');
  const candidates = rows.filter(row => normalize(row.model_name) === normalize(name));
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function scoreRank(rows: SummaryRow[], row: SummaryRow): number {
  return 1 + rows.filter(other => other.elo_mean > row.elo_mean).length;
}

export function scoreInterval(row: SummaryRow): string | null {
  return Number.isFinite(row.elo_ci_lower) && Number.isFinite(row.elo_ci_upper) && row.elo_ci_lower! <= row.elo_ci_upper!
    ? `${row.elo_ci_lower!.toFixed(1)}–${row.elo_ci_upper!.toFixed(1)}` : null;
}

export function rowStrength(rows: SummaryRow[], row: SummaryRow): number {
  const values = rows.map(r => r.elo_mean);
  const low = Math.min(...values), high = Math.max(...values);
  return high === low ? 0.5 : (row.elo_mean - low) / (high - low);
}

export function profileURL(name: string, run: string): string {
  return `/model/?id=${encodeURIComponent(name)}&run=${encodeURIComponent(run)}`;
}
