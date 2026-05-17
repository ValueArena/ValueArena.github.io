// Shapes of the JSON files under runs/<slug>/ on the HF dataset.

export interface IndexRun {
  slug: string;
  name?: string;
  group?: string;
  note?: string;
  constitution?: string;
  timestamp: string;
  // …additional fields exist on HF but we only consume these.
  [k: string]: unknown;
}

export interface IndexJson {
  runs: IndexRun[];
}

export interface SummaryRow {
  model_index: number;
  model_name: string;
  elo_mean: number;
  elo_std?: number;
  elo_ci_lower?: number;
  elo_ci_upper?: number;
}

export type Summary = SummaryRow[];

export interface MetaModel {
  id?: string | null;
  type?: 'api' | 'lora' | 'base' | string;
  base_model?: string | null;
  adapter?: string | null;
}

export interface MetaJson {
  name?: string;
  timestamp?: string;
  git_commit?: string;
  git_repo?: string;
  models?: Record<string, MetaModel>;
  constitution?: { path?: string; num_criteria?: number };
  training?: Record<string, unknown>;
  collection?: Record<string, unknown>;
  bootstrap?: Record<string, unknown>;
  log?: Record<string, unknown>;
  eigentrust?: number[];
  dataset?: Record<string, unknown>;
  [k: string]: unknown;
}
