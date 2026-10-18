import type { MetaJson } from './types';

export interface OmittedSample {
  /** Null when the judgment is one of several identical ones (a recurring pair or an epoch). */
  sample_id: string | null;
  scenario_index: number | null;
  scenario: string;
  judge: string;
  models: string[];
  reason: 'sample_error' | 'not_exported';
  error: string | null;
  log_file?: string | null;
  round?: number | null;
  epoch?: number | null;
}
export interface UnstartedJudgment {
  scenario_index: number;
  judge: string;
  models: string[];
}
export interface CollectionLog {
  file: string;
  role: 'judgments' | 'responses';
  model: string | null;
  status: string;
  samples: number;
  failed: number;
}
/** One collection or extension of a run. Counts are null when unknown, never 0. */
export interface CollectionPart {
  kind: 'collection' | 'extension';
  status: 'exported' | 'refused' | 'unknown';
  error: string | null;
  planned: number | null;
  logged: number | null;
  exported: number | null;
  failed: number | null;
  omitted: number | null;
  unstarted: number | null;
  logs: CollectionLog[];
  omissions: OmittedSample[];
  unstarted_judgments: UnstartedJudgment[] | null;
}
/** A published collection report, version 1 or 2, in one shape. Null counts mean unknown. */
export interface CollectionReport {
  version: 1 | 2;
  planned: number | null;
  logged: number | null;
  exported: number | null;
  failed: number | null;
  omitted: number | null;
  unstarted: number | null;
  log_files: string[];
  collections: CollectionPart[];
  omissions: OmittedSample[];
  unstarted_judgments: UnstartedJudgment[] | null;
}

const COUNTS = ['planned', 'logged', 'exported', 'failed', 'omitted', 'unstarted'] as const;
type Counts = Record<typeof COUNTS[number], number | null>;

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** A count or an explicit null (unknown); undefined for anything else. */
function countOrNull(value: unknown): number | null | undefined {
  return value === null ? null : count(value) ?? undefined;
}

const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');

function validOmission(row: unknown): row is OmittedSample {
  const r = row as OmittedSample;
  if (!r || (r.sample_id !== null && typeof r.sample_id !== 'string') || typeof r.scenario !== 'string' || typeof r.judge !== 'string') return false;
  if (r.scenario_index !== null && count(r.scenario_index) === null) return false;
  if (!isStrings(r.models)) return false;
  if (r.log_file !== undefined && r.log_file !== null && typeof r.log_file !== 'string') return false;
  return ['sample_error', 'not_exported'].includes(r.reason) && (r.error === null || typeof r.error === 'string');
}

function validUnstarted(row: unknown): row is UnstartedJudgment {
  const r = row as UnstartedJudgment;
  return Boolean(r) && count(r.scenario_index) !== null && typeof r.judge === 'string' && isStrings(r.models);
}

/** The identities every report must satisfy, checked wherever the counts are known. */
function consistent(c: Counts): boolean {
  // failed <= omitted needs no check of its own: failed must equal the sample_error rows.
  const { planned, logged, exported, omitted, unstarted } = c;
  if (logged !== null && exported !== null && omitted !== null && exported + omitted !== logged) return false;
  // A known plan can leave unstarted unknown, when the logs hold more than it asked for.
  if (planned !== null && logged !== null && unstarted !== null && logged + unstarted !== planned) return false;
  return true;
}

function readCounts(value: Record<string, unknown>): Counts | null {
  const counts = {} as Counts;
  for (const name of COUNTS) {
    const parsed = countOrNull(value[name]);
    if (parsed === undefined) return null;
    counts[name] = parsed;
  }
  return consistent(counts) ? counts : null;
}

function parsePart(value: unknown): CollectionPart | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as CollectionPart;
  const counts = readCounts(value as Record<string, unknown>);
  if (!counts || !['collection', 'extension'].includes(p.kind) || !['exported', 'refused', 'unknown'].includes(p.status)) return null;
  if (p.error !== null && typeof p.error !== 'string') return null;
  if (!Array.isArray(p.logs) || !p.logs.every(log => log && typeof log.file === 'string' && ['judgments', 'responses'].includes(log.role))) return null;
  if (!Array.isArray(p.omissions) || !p.omissions.every(validOmission)) return null;
  if (counts.omitted !== null && p.omissions.length !== counts.omitted) return null;
  if (counts.failed !== null && p.omissions.filter(row => row.reason === 'sample_error').length !== counts.failed) return null;
  if (p.unstarted_judgments === null) {
    if (counts.unstarted !== null) return null;
  } else if (!Array.isArray(p.unstarted_judgments) || !p.unstarted_judgments.every(validUnstarted) || p.unstarted_judgments.length !== counts.unstarted) return null;
  return { ...p, ...counts };
}

function parseVersion1(r: Record<string, unknown>): CollectionReport | null {
  if (r.source !== 'inspect_log' || typeof r.log_file !== 'string') return null;
  const logged = count(r.logged_samples), exported = count(r.exported_samples);
  const omitted = count(r.omitted_samples), failed = count(r.failed_samples);
  if (logged === null || exported === null || omitted === null || failed === null) return null;
  if (!consistent({ planned: null, logged, exported, failed, omitted, unstarted: null })) return null;
  const omissions = r.omissions;
  if (!Array.isArray(omissions) || omissions.length !== omitted || !omissions.every(validOmission)) return null;
  if (omissions.filter(row => row.reason === 'sample_error').length !== failed) return null;
  // Version 1 read one log and knew nothing of the plan.
  return { version: 1, planned: null, logged, exported, failed, omitted, unstarted: null, log_files: [r.log_file],
    collections: [], omissions, unstarted_judgments: null };
}

function parseVersion2(r: Record<string, unknown>): CollectionReport | null {
  if (r.source !== 'inspect_logs' || !Array.isArray(r.collections) || r.collections.length === 0) return null;
  const totals = readCounts(r);
  const collections = r.collections.map(parsePart);
  if (!totals || collections.some(part => part === null)) return null;
  const parts = collections as CollectionPart[];
  for (const name of COUNTS) {
    const values = parts.map(part => part[name]);
    // A part with an unknown count makes the run's total unknown, never a smaller number.
    const sum = values.some(value => value === null) ? null : (values as number[]).reduce((a, b) => a + b, 0);
    if (sum !== totals[name]) return null;
  }
  const unstarted = parts.some(part => part.unstarted_judgments === null) ? null : parts.flatMap(part => part.unstarted_judgments || []);
  return { version: 2, ...totals, log_files: [...new Set(parts.flatMap(part => part.logs.map(log => log.file)))],
    collections: parts, omissions: parts.flatMap(part => part.omissions), unstarted_judgments: unstarted };
}

/** Invalid or incomplete evidence must never turn into a zero-failure claim. */
export function parseCollectionReport(value: unknown): CollectionReport | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  if (r.schema_version === 2) return parseVersion2(r);
  // Version 1: runs published before the version 2 report.
  if (r.schema_version === 1) return parseVersion1(r);
  return null;
}

export interface CoverageEstimate {
  source: 'reported' | 'estimate' | 'unknown';
  omitted: number | null;
  exported: number | null;
  expected: number | null;
  partial: boolean;
  inconsistent: boolean;
}

export function estimateCoverage(meta: MetaJson): CoverageEstimate {
  const collection = meta.collection || {};
  const mode = meta.evaluation?.mode || meta.evaluation_mode;
  const exported = count(meta.analysis?.total_direct_judgments) ?? count(meta.log?.total_direct_judgments);
  const reported = count(collection.missing_direct_judgments);
  const partial = collection.status === 'partial';
  const base: CoverageEstimate = { source: 'unknown', omitted: null, exported, expected: null, partial, inconsistent: false };
  if (reported !== null) return { ...base, source: 'reported', omitted: reported };
  if (mode !== 'direct_rating' && mode !== 'direct') return base;
  const scenarios = count(meta.dataset?.count);
  const models = Object.keys(meta.models || {}).length;
  const sampler = collection.sampler_mode || 'all_to_all';
  let perScenario: number;
  if (sampler === 'all_to_all' || sampler === 'exhaustive') {
    perScenario = models * (meta.evaluation?.direct_rating?.include_self === false ? models - 1 : models);
  } else if (['balanced_unique_judge', 'partitioned_random_judge', 'partitioned', 'random_partition'].includes(String(sampler))) {
    const redundancy = count(collection.response_redundancy ?? 1);
    if (!redundancy || redundancy > models) return base;
    perScenario = models * redundancy;
  } else return base;
  if (!scenarios || !models || exported === null) return base;
  const expected = scenarios * perScenario;
  if (!Number.isSafeInteger(expected) || expected <= 0) return base;
  // Extended panels can have more judgments than a single-pass spec predicts.
  if (exported > expected) return { ...base, expected, inconsistent: true };
  return { ...base, source: 'estimate', expected, omitted: expected - exported };
}
