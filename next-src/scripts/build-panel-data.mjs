// Builds public/panel/panel.json, the data behind /panel/, from the Nov 22 panel runs.
//
//   node scripts/build-panel-data.mjs
//
// Reads each constitution's run in the Hugging Face dataset (assignments from the
// primary and second-judge evaluations, scores, planned-but-missing judgments) and
// joins the scenario bank's criterion tags from scripts/panel-bank-tags.json.
// Judgment text is not copied: the page reads it from the run's evaluations when opened.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import path from 'node:path';

const GROUP = 'nov22-50x9-primary';
const HF = 'https://huggingface.co/datasets/invi-bhagyesh/ValueArena/resolve/main';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(HERE, '..', 'public', 'panel');

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

/** Each record with its byte range, so the page can fetch one judgment with a Range request. */
async function* jsonLines(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  let offset = 0;
  for await (const line of createInterface({ input: Readable.fromWeb(response.body), crlfDelay: Infinity })) {
    const length = Buffer.byteLength(line, 'utf8');
    if (line.trim()) yield { record: JSON.parse(line), range: [offset, length] };
    offset += length + 1;
  }
}

const label = name => name.split(' / ')[0];

const index = await fetchJSON(`${HF}/index.json`);
const runs = index.runs.filter(run => run.slug.startsWith(`${GROUP}/`))
  .sort((a, b) => a.constitution.localeCompare(b.constitution));
if (!runs.length) throw new Error(`no ${GROUP} runs in index.json`);
const bankFile = JSON.parse(readFileSync(path.join(HERE, 'panel-bank-tags.json'), 'utf8'));
const bankTags = bankFile.tags;
// The published files don't list planned second-judge judgments that never arrived.
const missingAudits = bankFile.missingAudits ?? [];

let models = null;
let bank = null;
const constitutions = [];
for (const run of runs) {
  const base = `${HF}/runs/${run.slug}`;
  console.log(`Reading ${run.slug}`);
  const [meta, criteria, summary, auditSummary, scenarioIndex, report, scenarios] = await Promise.all([
    fetchJSON(`${base}/meta.json`), fetchJSON(`${base}/constitution.json`), fetchJSON(`${base}/summary.json`),
    fetchJSON(`${base}/data/primary_plus_audit_summary.json`), fetchJSON(`${base}/data/scenario_index.json`),
    fetchJSON(`${base}/collection_report.json`), fetchJSON(`${base}/scenarios.json`),
  ]);
  const names = Object.keys(meta.models);
  if (!models) models = names.map(name => ({ name, ref: meta.models[name].id }));
  else if (names.join() !== models.map(m => m.name).join()) throw new Error(`${run.slug}: model order differs`);
  if (!bank) bank = scenarios.map(s => ({ id: s.scenario_id, prompt: s.scenario, tags: bankTags[s.scenario_id] ?? {} }));
  else if (scenarios.map(s => s.scenario_id).join() !== bank.map(s => s.id).join()) throw new Error(`${run.slug}: scenario bank differs`);

  const promptOf = new Map(scenarioIndex.map((row, position) => [row.scenario_index, position]));
  const prompts = scenarioIndex.map(row => row.scenario_id);
  const primary = names.map(() => prompts.map(() => -1));
  const missing = [];
  const audits = [];
  let primaryCount = 0;
  const ranges = {};
  for await (const { record, range } of jsonLines(`${base}/evaluations.jsonl`)) {
    const position = promptOf.get(record.scenario_index);
    if (position === undefined) throw new Error(`${run.slug}: scenario ${record.scenario_index} not in scenario_index.json`);
    const answerer = record.evaluee.index, judge = record.judge.index;
    if (primary[answerer][position] !== -1 && primary[answerer][position] !== judge) throw new Error(`${run.slug}: two primary judges for one answer`);
    primary[answerer][position] = judge;
    ranges[`p:${answerer}:${position}:${judge}`] = range;
    primaryCount++;
  }
  for (const part of report.collections ?? []) {
    for (const gap of part.unstarted_judgments ?? []) {
      const position = promptOf.get(gap.scenario_index);
      for (const model of gap.models) {
        const answerer = names.indexOf(model), judge = names.indexOf(gap.judge);
        primary[answerer][position] = judge;
        missing.push([answerer, position, judge]);
      }
    }
  }
  for await (const { record, range } of jsonLines(`${base}/data/audit_evaluations.jsonl`)) {
    const row = [record.evaluee.index, promptOf.get(record.scenario_index), record.judge.index];
    audits.push(row);
    ranges[`a:${row.join(':')}`] = range;
  }
  const missingAudit = [];
  for (const gap of missingAudits.filter(gap => gap.constitution === run.constitution)) {
    const row = [names.indexOf(gap.answerer), prompts.indexOf(gap.scenario_id), names.indexOf(gap.judge)];
    if (row.includes(-1)) throw new Error(`${run.slug}: unknown missing second judgment ${JSON.stringify(gap)}`);
    audits.push(row);
    missingAudit.push(row);
  }
  const audited = new Map(auditSummary.map(row => [row.model_name, row]));
  constitutions.push({
    id: run.constitution,
    label: label(run.name),
    slug: run.slug,
    criteria,
    prompts,
    primary,
    missing,
    audits,
    missingAudit,
    counts: { primary: primaryCount, audit: audits.length - missingAudit.length },
    ranges,
    scores: summary.map(row => ({
      model: row.model_name, rank: row.rank, elo: row.elo_point, low: row.elo_ci_lower, high: row.elo_ci_upper,
      rankLow: row.rank_ci_lower, rankHigh: row.rank_ci_upper, firstPlace: row.first_place_frequency,
      auditRank: audited.get(row.model_name)?.rank ?? null, auditElo: audited.get(row.model_name)?.elo_point ?? null,
    })),
    bootstrap: { samples: meta.analysis?.bootstrap_samples ?? null, method: meta.analysis?.bootstrap_method ?? null },
  });
}

const missingTags = bank.filter(s => !bankTags[s.id]).map(s => s.id);
if (missingTags.length) console.warn(`No criterion tags for ${missingTags.length} scenarios: ${missingTags.join(', ')}`);
mkdirSync(OUT, { recursive: true });
const data = { group: GROUP, title: runs[0].group, timestamp: runs[0].timestamp, models, constitutions, bank };
writeFileSync(path.join(OUT, 'panel.json'), JSON.stringify(data));
console.log(`Wrote ${constitutions.length} constitutions, ${bank.length} scenarios to public/panel/panel.json`);
