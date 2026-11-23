// Shape of public/panel/panel.json (scripts/build-panel-data.mjs) and helpers over it.

export interface PanelScore {
  model: string; rank: number; elo: number; low: number; high: number;
  rankLow: number; rankHigh: number; firstPlace: number;
  auditRank: number | null; auditElo: number | null;
}

export interface PanelConstitution {
  id: string;
  label: string;
  /** Run slug in the Hugging Face dataset. */
  slug: string;
  criteria: string[];
  /** Scenario IDs in run order: the matrix columns. */
  prompts: string[];
  /** primary[answerer][promptPos] = judge index, or -1. */
  primary: number[][];
  /** Planned primary judgments that never arrived: [answerer, promptPos, judge]. */
  missing: [number, number, number][];
  /** Second-judge assignments: [answerer, promptPos, judge]. */
  audits: [number, number, number][];
  missingAudit: [number, number, number][];
  counts: { primary: number; audit: number };
  /** "p|a:answerer:promptPos:judge" -> [byteStart, byteLength] in the run's JSONL file. */
  ranges: Record<string, [number, number]>;
  scores: PanelScore[];
  bootstrap: { samples: number | null; method: string | null };
}

export interface BankScenario {
  id: string;
  prompt: string;
  /** constitution id -> 1-based criterion numbers the scenario was written to test. */
  tags: Record<string, number[]>;
}

export interface PanelData {
  group: string;
  title: string;
  timestamp: string;
  models: { name: string; ref: string }[];
  constitutions: PanelConstitution[];
  bank: BankScenario[];
}

export type Layer = 'primary' | 'second';

export interface Assignment { judges: number[]; missing: Set<number> }

/** Every answerer × prompt slot in one layer, with its judges and which are missing. */
export function assignments(c: PanelConstitution, layer: Layer): Assignment[][] {
  const grid = c.primary.map(row => row.map(() => ({ judges: [] as number[], missing: new Set<number>() })));
  if (layer === 'primary') {
    c.primary.forEach((row, a) => row.forEach((judge, p) => { if (judge >= 0) grid[a][p].judges.push(judge); }));
    for (const [a, p, j] of c.missing) grid[a][p].missing.add(j);
  } else {
    for (const [a, p, j] of c.audits) grid[a][p].judges.push(j);
    for (const [a, p, j] of c.missingAudit) grid[a][p].missing.add(j);
  }
  return grid;
}

export function rangeKey(layer: Layer, answerer: number, prompt: number, judge: number): string {
  return `${layer === 'primary' ? 'p' : 'a'}:${answerer}:${prompt}:${judge}`;
}

export const HF_RUNS = 'https://huggingface.co/datasets/invi-bhagyesh/ValueArena/resolve/main/runs';

export function judgmentFileURL(c: PanelConstitution, layer: Layer): string {
  return `${HF_RUNS}/${c.slug}/${layer === 'primary' ? 'evaluations.jsonl' : 'data/audit_evaluations.jsonl'}`;
}

/** Criterion tags for one constitution's prompts, by prompt position. */
export function promptTags(data: PanelData, c: PanelConstitution): number[][] {
  const byId = new Map(data.bank.map(s => [s.id, s]));
  return c.prompts.map(id => byId.get(id)?.tags[c.id] ?? []);
}

/** Judge palette: distinct hues that hold up in both themes. */
export const JUDGE_COLORS = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#76b7b2', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac', '#86bcb6', '#d37295'];
export const judgeColor = (j: number) => JUDGE_COLORS[j % JUDGE_COLORS.length];
