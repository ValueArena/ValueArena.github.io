import type { IndexRun, SummaryRow } from './types';

export interface ValueBoard { id: string; run: IndexRun; runs: IndexRun[] }
const FEATURED = 'frontier-direct-ratings-200';
const KNOWN = new Set(['kindness', 'goodness', 'humor', 'sarcasm', 'loving', 'poeticism', 'nonchalance', 'remorse', 'impulsiveness', 'mathematical', 'sycophancy', 'misalignment', 'claude', 'openai', 'conservatism', 'deep_ecology']);

// Later panels name some values without the _constitution suffix; keep one board per value.
const ALIASES: Record<string, string> = { taoism: 'taoism_constitution', marxism: 'marxism_constitution', 'lockean-rights': 'lockean_rights_constitution' };

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

export function publishedBoards(runs: IndexRun[], preferredRun?: string): ValueBoard[] {
  const groups = new Map<string, IndexRun[]>();
  for (const run of runs) {
    const id = valueId(run);
    if (!id) continue;
    groups.set(id, [...(groups.get(id) || []), run]);
  }
  return [...groups].map(([id, choices]) => {
    choices.sort((a, b) => Number(b.slug === preferredRun) - Number(a.slug === preferredRun)
      || Number(b.group === FEATURED) - Number(a.group === FEATURED)
      || (Number(b.models_count) || 0) - (Number(a.models_count) || 0)
      || String(b.timestamp).localeCompare(String(a.timestamp)));
    return { id, run: choices[0], runs: choices };
  }).sort((a, b) => Number(b.id === 'kindness') - Number(a.id === 'kindness') || a.id.localeCompare(b.id));
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
