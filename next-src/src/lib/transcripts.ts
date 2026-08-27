// Reads runs/<slug>/evaluations.jsonl off the HF dataset.
//
// The files are large and the CDN serves them uncompressed — a 200-scenario
// direct run is 23 MB on the wire. But roughly 45% of that is one constitution
// repeated once per record, plus the same criterion texts repeated inside every
// `ratings` array. So the page streams the whole file in windows (filters have
// to see every judgment to be trustworthy) while keeping only what it cannot
// reconstruct: the constitution and criterion texts are stored once on the run,
// and the raw record is re-read by byte range when someone asks to see it.
//
// HF honours Range requests on this path — 206, uncompressed, true offsets,
// CORS-exposed — which is what makes both the windowing and the re-read work.

import { HF_BASE } from './config';

/** First window. Small, so the first rows appear without waiting on the file. */
export const FIRST_WINDOW_BYTES = 256 * 1024;

/** Every window after that. Larger, to keep the request count down. */
export const WINDOW_BYTES = 2 * 1024 * 1024;

/** Give up growing the window for a single oversized record past this. */
const MAX_WINDOW_BYTES = 8 * 1024 * 1024;

const NEWLINE = 0x0a;

export function evaluationsURL(slug: string): string {
  return `${HF_BASE}/runs/${slug}/evaluations.jsonl`;
}

// ── Reader ──────────────────────────────────────────────────────────────────

export interface JsonlRecord {
  /**
   * One-based line number in the file. Blank and malformed lines still take a
   * number, so this matches `sed -n '<line>p' evaluations.jsonl` exactly and
   * survives as a stable identifier for a judgment.
   */
  line: number;
  /** Absolute byte offset of the line's first byte. */
  byteStart: number;
  /** Length of the line in bytes, excluding the newline. */
  byteLen: number;
  value: unknown;
}

export interface WindowRead {
  /** Records parsed out of this window, in file order. */
  records: JsonlRecord[];
  /** Lines that were present but did not parse as JSON. */
  malformed: number;
}

interface RawLine {
  line: number;
  byteStart: number;
  byteLen: number;
  text: string;
}

/**
 * Sequential windowed reader over a newline-delimited JSON file.
 *
 * Line splitting happens on the raw bytes rather than on decoded text. In
 * UTF-8 a 0x0A byte can only ever be a real newline — continuation bytes are
 * all >= 0x80 — so scanning for it gives exact line boundaries, and each line
 * is then decoded whole. That yields true byte offsets and removes any chance
 * of a multi-byte character being torn by a window boundary.
 */
export class JsonlWindowReader {
  readonly url: string;
  /** Total file size in bytes, or -1 until the first response reports it. */
  totalBytes = -1;
  /** Bytes consumed so far. */
  offset = 0;
  done = false;

  /** Bytes held back because the last line in the window was incomplete. */
  private carry = new Uint8Array(0);
  /** Absolute offset of carry[0]. */
  private carryStart = 0;
  private decoder = new TextDecoder('utf-8');
  /** Lines consumed so far, blanks included, so numbering tracks the file. */
  private lineCount = 0;

  constructor(url: string) {
    this.url = url;
  }

  /** Fraction of the file consumed, 0–1, or null while the size is unknown. */
  get progress(): number | null {
    if (this.totalBytes <= 0) return null;
    return Math.min(1, this.offset / this.totalBytes);
  }

  /**
   * Read forward until at least one record is available or the file ends.
   *
   * A record larger than the window yields nothing on the first pass, so the
   * window doubles until a newline turns up or MAX_WINDOW_BYTES is reached.
   */
  async next(windowBytes: number = WINDOW_BYTES): Promise<WindowRead> {
    const out: WindowRead = { records: [], malformed: 0 };
    let size = windowBytes;
    while (!this.done && out.records.length === 0) {
      const lines = await this.readWindow(size);
      for (const { line, byteStart, byteLen, text } of lines) {
        try {
          out.records.push({ line, byteStart, byteLen, value: JSON.parse(text) });
        } catch {
          out.malformed += 1;
        }
      }
      if (out.records.length === 0 && !this.done) {
        if (size >= MAX_WINDOW_BYTES) {
          throw new Error(
            `No complete record found in ${Math.round(size / 1024)} KB — the file may not be newline-delimited JSON.`
          );
        }
        size = Math.min(size * 2, MAX_WINDOW_BYTES);
      }
    }
    return out;
  }

  /** Fetch one window and return the complete lines it closed out. */
  private async readWindow(size: number): Promise<RawLine[]> {
    const end = this.offset + size - 1;
    const res = await fetch(this.url, { headers: { Range: `bytes=${this.offset}-${end}` } });

    // Past the end of the file: nothing left but whatever the carry holds.
    if (res.status === 416) return this.finish();
    if (!res.ok) {
      throw new Error(
        res.status === 404
          ? 'This run has no evaluations.jsonl on the dataset.'
          : `Could not read transcripts (HTTP ${res.status}).`
      );
    }

    const buffer = new Uint8Array(await res.arrayBuffer());

    if (res.status === 200) {
      // The server ignored the Range header and sent the whole file. Take it
      // as the complete read rather than requesting the same bytes forever.
      this.totalBytes = buffer.byteLength;
      this.offset = buffer.byteLength;
      return this.split(buffer, true);
    }

    if (this.totalBytes < 0) {
      const total = parseContentRangeTotal(res.headers.get('Content-Range'));
      if (total != null) this.totalBytes = total;
    }

    if (buffer.byteLength === 0) return this.finish();

    this.offset += buffer.byteLength;
    return this.split(buffer, this.totalBytes >= 0 && this.offset >= this.totalBytes);
  }

  private split(chunk: Uint8Array, atEnd: boolean): RawLine[] {
    const base = this.carryStart;
    let combined: Uint8Array;
    if (this.carry.byteLength === 0) {
      combined = chunk;
    } else {
      combined = new Uint8Array(this.carry.byteLength + chunk.byteLength);
      combined.set(this.carry, 0);
      combined.set(chunk, this.carry.byteLength);
    }

    const out: RawLine[] = [];
    let start = 0;
    for (let i = 0; i < combined.byteLength; i += 1) {
      if (combined[i] !== NEWLINE) continue;
      this.emit(out, combined, start, i, base);
      start = i + 1;
    }

    if (atEnd) {
      this.done = true;
      // A file ending in a newline leaves nothing here, which is not a line.
      if (start < combined.byteLength) {
        this.emit(out, combined, start, combined.byteLength, base);
      }
      this.carry = new Uint8Array(0);
      this.carryStart = base + combined.byteLength;
    } else {
      this.carry = combined.slice(start);
      this.carryStart = base + start;
    }
    return out;
  }

  /** Number every line, but return only the ones holding something. */
  private emit(out: RawLine[], buf: Uint8Array, from: number, to: number, base: number): void {
    this.lineCount += 1;
    if (to <= from) return;
    const text = this.decoder.decode(buf.subarray(from, to));
    if (!text.trim()) return;
    out.push({
      line: this.lineCount,
      byteStart: base + from,
      byteLen: to - from,
      text,
    });
  }

  private finish(): RawLine[] {
    this.done = true;
    const out: RawLine[] = [];
    if (this.carry.byteLength > 0) {
      this.emit(out, this.carry, 0, this.carry.byteLength, this.carryStart);
      this.carry = new Uint8Array(0);
    }
    return out;
  }
}

function parseContentRangeTotal(header: string | null): number | null {
  if (!header) return null;
  const m = header.match(/\/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

/**
 * Re-read one record's raw bytes.
 *
 * The scan discards each record's original JSON so the whole file can be held
 * in memory; this fetches a single line back when someone opens the Record tab.
 */
export async function fetchRawRecord(
  url: string,
  byteStart: number,
  byteLen: number
): Promise<string> {
  const res = await fetch(url, {
    headers: { Range: `bytes=${byteStart}-${byteStart + byteLen - 1}` },
  });
  if (!res.ok && res.status !== 206) {
    throw new Error(`Could not re-read the record (HTTP ${res.status}).`);
  }
  const text = await res.text();
  // A server that ignored the Range header hands back the whole file; take the
  // line the offsets point at rather than a 23 MB string.
  if (res.status === 200 && text.length > byteLen * 2) {
    const slice = new TextDecoder('utf-8').decode(
      new TextEncoder().encode(text).subarray(byteStart, byteStart + byteLen)
    );
    return slice;
  }
  return text;
}

// ── Criteria ────────────────────────────────────────────────────────────────

export interface Criterion {
  /** Zero-based, matching `criterion_index` in direct-rating records. */
  index: number;
  /** Full criterion text, including its "Criterion N for X:" prefix. */
  text: string;
  /** The text with that prefix stripped, for tighter display. */
  body: string;
}

const CRITERION_HEAD = /^Criterion\s+(\d+)\b\s*(?:for\s+[^:]+)?:?\s*/i;

/**
 * Split a constitution blob into criteria.
 *
 * Criteria are written one per line as "Criterion N for X: prefer …", but a
 * criterion may itself wrap, so the split is on the lookahead rather than on
 * newlines.
 */
export function parseCriteria(constitution: unknown): Criterion[] {
  const text = typeof constitution === 'string' ? constitution : '';
  if (!text.trim()) return [];
  return text
    .split(/(?=^Criterion\s+\d+\b)/m)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const head = part.match(CRITERION_HEAD);
      const oneBased = head ? Number(head[1]) : NaN;
      return {
        index: Number.isFinite(oneBased) ? oneBased - 1 : -1,
        text: part,
        body: head ? part.slice(head[0].length).trim() : part,
      };
    })
    .filter((c) => c.index >= 0)
    .sort((a, b) => a.index - b.index);
}

// ── Judgments ───────────────────────────────────────────────────────────────

interface JudgmentBase {
  /**
   * The judgment's identifier: its one-based line number in
   * evaluations.jsonl. Shown on every row, carried in the URL, and the same
   * number `sed -n '<id>p' evaluations.jsonl` prints.
   */
  id: number;
  /** Where the record sits in the file, for re-reading it on demand. */
  byteStart: number;
  byteLen: number;
  scenarioIndex: number;
  scenario: string;
  judge: string;
}

export interface DirectJudgment extends JudgmentBase {
  kind: 'direct';
  evaluee: string;
  response: string;
  reflection: string;
  judgmentRaw: string;
  /** Criterion index (zero-based) to rating on the run's scale. */
  ratings: Map<number, number>;
  /** Criteria the judge declined to rate. */
  declined: number[];
  sampling: Record<string, unknown> | null;
}

export interface PairwiseSide {
  name: string;
  response: string;
  reflection: string;
}

export interface PairwiseJudgment extends JudgmentBase {
  kind: 'pairwise';
  a: PairwiseSide;
  b: PairwiseSide;
  judgeResponse: string;
  /** Criterion index (zero-based) to 0 = tie, 1 = first response, 2 = second. */
  choices: Map<number, 0 | 1 | 2>;
  /**
   * How many leading criteria training actually used. Extraction keeps the
   * largest contiguous run starting at criterion 1 and drops the rest, so a
   * judge that skipped criterion 3 contributes only criteria 1–2.
   */
  countedThrough: number;
}

export type Judgment = DirectJudgment | PairwiseJudgment;

/**
 * Pull `<criterion_N_choice>` verdicts out of a judge response.
 *
 * Mirrors `_extract_valid_criterion_scores` in pipeline/utils/comparisons.py:
 * only 0/1/2 count, the first tag for a given criterion wins, and anything
 * above `numCriteria` is ignored.
 */
export function extractPairwiseChoices(
  judgeResponse: unknown,
  numCriteria: number
): Map<number, 0 | 1 | 2> {
  const text = typeof judgeResponse === 'string' ? judgeResponse : '';
  const found = new Map<number, 0 | 1 | 2>();
  const re = /<criterion_(\d+)_choice>\s*([\s\S]*?)\s*<\/criterion_\1_choice>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const oneBased = Number(m[1]);
    const value = Number(m[2].trim());
    if (!Number.isInteger(oneBased) || oneBased < 1) continue;
    if (numCriteria > 0 && oneBased > numCriteria) continue;
    if (value !== 0 && value !== 1 && value !== 2) continue;
    const index = oneBased - 1;
    if (!found.has(index)) found.set(index, value as 0 | 1 | 2);
  }
  return found;
}

/** Length of the run 0,1,2,… present in `choices`, matching the extractor. */
export function contiguousPrefix(choices: Map<number, unknown>): number {
  let n = 0;
  while (choices.has(n)) n += 1;
  return n;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Turn one raw record into a judgment, or null if it is neither shape.
 *
 * The record's own `constitution` and the criterion text inside each rating are
 * deliberately dropped — they are identical in every record of a run and are
 * held once on the run instead. Keeping them here is what would make holding
 * the whole file in memory expensive.
 */
export function normalizeJudgment(
  record: JsonlRecord,
  numCriteria: number
): Judgment | null {
  const raw = record.value;
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const base = {
    id: record.line,
    byteStart: record.byteStart,
    byteLen: record.byteLen,
    scenarioIndex: num(r.scenario_index, -1),
    scenario: str(r.scenario),
    judge: '',
  };

  if (r.record_type === 'direct_rating' || Array.isArray(r.ratings)) {
    const judge = r.judge as Record<string, unknown> | undefined;
    const evaluee = r.evaluee as Record<string, unknown> | undefined;
    const ratings = new Map<number, number>();
    for (const entry of (r.ratings as unknown[]) || []) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const index = num(e.criterion_index, -1);
      const rating = num(e.rating, NaN);
      if (index >= 0 && Number.isFinite(rating)) ratings.set(index, rating);
    }
    const declined = Array.isArray(r.missing_criterion_indices)
      ? (r.missing_criterion_indices as unknown[]).map((v) => num(v, -1)).filter((v) => v >= 0)
      : [];
    return {
      ...base,
      kind: 'direct',
      judge: str(judge?.name) || 'unknown',
      evaluee: str(evaluee?.name) || 'unknown',
      response: str(r.response),
      reflection: str(r.reflection),
      judgmentRaw: str(r.judgment_raw),
      ratings,
      declined,
      sampling: (r.sampling as Record<string, unknown>) ?? null,
    };
  }

  if (typeof r.eval1_name === 'string' || typeof r.eval2_name === 'string') {
    const choices = extractPairwiseChoices(r['judge response'], numCriteria);
    return {
      ...base,
      kind: 'pairwise',
      judge: str(r.judge_name) || 'unknown',
      a: {
        name: str(r.eval1_name) || 'response 1',
        response: str(r['eval1 response']),
        reflection: str(r['eval1 reflection']),
      },
      b: {
        name: str(r.eval2_name) || 'response 2',
        response: str(r['eval2 response']),
        reflection: str(r['eval2 reflection']),
      },
      judgeResponse: str(r['judge response']),
      choices,
      countedThrough: contiguousPrefix(choices),
    };
  }

  return null;
}

// ── Derived values ──────────────────────────────────────────────────────────

/** Mean of the ratings a direct judgment actually gave, or null if it gave none. */
export function meanRating(j: DirectJudgment): number | null {
  if (j.ratings.size === 0) return null;
  let total = 0;
  for (const value of j.ratings.values()) total += value;
  return total / j.ratings.size;
}

/** Share of criteria decided for the first response, ignoring ties. */
export function pairwiseTilt(j: PairwiseJudgment): number | null {
  let a = 0;
  let b = 0;
  for (let i = 0; i < j.countedThrough; i += 1) {
    const choice = j.choices.get(i);
    if (choice === 1) a += 1;
    else if (choice === 2) b += 1;
  }
  if (a + b === 0) return null;
  return a / (a + b);
}

/** Every model named by a judgment, judge included. */
export function judgmentModels(j: Judgment): string[] {
  return j.kind === 'direct' ? [j.judge, j.evaluee] : [j.judge, j.a.name, j.b.name];
}

/** True when the judge left at least one declared criterion unanswered. */
export function hasDeclines(j: Judgment, numCriteria: number): boolean {
  if (j.kind === 'direct') return j.declined.length > 0;
  return numCriteria > 0 && j.countedThrough < numCriteria;
}
