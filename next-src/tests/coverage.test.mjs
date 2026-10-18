import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateCoverage, parseCollectionReport } from '../src/lib/coverage.ts';

const meta = {
  evaluation_mode: 'direct_rating',
  models: Object.fromEntries(Array.from({ length: 27 }, (_, i) => [`m${i}`, {}])),
  dataset: { count: 400 },
  collection: { sampler_mode: 'balanced_unique_judge', response_redundancy: 1 },
  analysis: { total_direct_judgments: 7754, observed_edge_coverage: 1 },
};
test('full edge coverage does not hide the 3046 missing judgments', () => {
  assert.deepEqual(estimateCoverage(meta), { source: 'estimate', omitted: 3046, exported: 7754, expected: 10800, partial: false, inconsistent: false });
});
test('unknown, zero shortfall, and explicit partial results stay distinct', () => {
  assert.equal(estimateCoverage({}).omitted, null);
  assert.equal(estimateCoverage({ ...meta, analysis: { total_direct_judgments: 10800 } }).source, 'estimate');
  const partial = estimateCoverage({ ...meta, collection: { status: 'partial', missing_direct_judgments: 2 } });
  assert.equal(partial.source, 'reported');
  assert.equal(partial.omitted, 2);
  assert.equal(partial.partial, true);
});
test('extended or unsupported plans never claim zero omissions', () => {
  assert.equal(estimateCoverage({ ...meta, analysis: { total_direct_judgments: 11000 } }).omitted, null);
  assert.equal(estimateCoverage({ ...meta, collection: { sampler_mode: 'custom' } }).source, 'unknown');
  assert.equal(estimateCoverage({ ...meta, evaluation_mode: 'pairwise_btd' }).source, 'unknown');
});
test('all-to-all respects excluded self judgments', () => {
  const result = estimateCoverage({ ...meta, evaluation: { mode: 'direct_rating', direct_rating: { include_self: false } }, collection: { sampler_mode: 'all_to_all' } });
  assert.equal(result.expected, 400 * 27 * 26);
});
const report = {
  schema_version: 1, source: 'inspect_log', log_file: 'run.eval',
  logged_samples: 2, exported_samples: 1, omitted_samples: 1, failed_samples: 1,
  omissions: [{ sample_id: 's0', scenario_index: 0, scenario: 'A dilemma', judge: 'judge', models: ['model'], reason: 'sample_error', error: 'Truncated' }],
};
test('version 1 reports still parse, with the plan unknown', () => {
  assert.deepEqual(parseCollectionReport(report), {
    version: 1, planned: null, logged: 2, exported: 1, failed: 1, omitted: 1, unstarted: null,
    log_files: ['run.eval'], collections: [], omissions: report.omissions, unstarted_judgments: null,
  });
  assert.ok(parseCollectionReport({ ...report, logged_samples: 1, exported_samples: 1, omitted_samples: 0, failed_samples: 0, omissions: [] }));
});
test('malformed and inconsistent reports are unavailable, not complete', () => {
  for (const bad of [null, {}, { ...report, omitted_samples: -1 }, { ...report, logged_samples: '2' }, { ...report, failed_samples: 0, omissions: [] }, { ...report, exported_samples: 2 }, { ...report, failed_samples: 0 }, { ...report, omissions: [null] }, { ...report, log_file: null }]) {
    assert.equal(parseCollectionReport(bad), null);
  }
});

const omission = { ...report.omissions[0], log_file: 'judge_a.eval' };
const part = {
  kind: 'collection', status: 'exported', error: null,
  planned: 4, logged: 3, exported: 2, failed: 1, omitted: 1, unstarted: 1,
  logs: [{ file: 'judge_a.eval', role: 'judgments', model: 'judge', status: 'success', samples: 3, failed: 1 },
         { file: 'responses.eval', role: 'responses', model: 'model', status: 'success', samples: 2, failed: 0 }],
  omissions: [omission],
  unstarted_judgments: [{ scenario_index: 3, judge: 'judge', models: ['model'] }],
};
const v2 = { schema_version: 2, source: 'inspect_logs', failure_policy: 'omit_invalid_judgments',
  planned: 4, logged: 3, exported: 2, failed: 1, omitted: 1, unstarted: 1, collections: [part] };

test('version 2 reports carry the plan, every log and what never started', () => {
  const parsed = parseCollectionReport(v2);
  assert.equal(parsed.version, 2);
  assert.deepEqual([parsed.planned, parsed.logged, parsed.exported, parsed.failed, parsed.omitted, parsed.unstarted], [4, 3, 2, 1, 1, 1]);
  assert.deepEqual(parsed.log_files, ['judge_a.eval', 'responses.eval']);
  assert.deepEqual(parsed.omissions, [omission]);
  assert.deepEqual(parsed.unstarted_judgments, part.unstarted_judgments);
});
test('version 2 totals sum the collections and extensions', () => {
  const extension = { ...part, kind: 'extension', planned: 2, logged: 2, exported: 2, failed: 0, omitted: 0, unstarted: 0,
    logs: [{ ...part.logs[0], file: 'extend.eval' }], omissions: [], unstarted_judgments: [] };
  const parsed = parseCollectionReport({ ...v2, planned: 6, logged: 5, exported: 4, unstarted: 1, collections: [part, extension] });
  assert.deepEqual([parsed.planned, parsed.logged, parsed.exported, parsed.unstarted], [6, 5, 4, 1]);
  assert.deepEqual(parsed.log_files, ['judge_a.eval', 'responses.eval', 'extend.eval']);
});
test('an unknown plan stays unknown, never 0', () => {
  const unknown = { ...part, planned: null, unstarted: null, unstarted_judgments: null };
  const parsed = parseCollectionReport({ ...v2, planned: null, unstarted: null, collections: [unknown] });
  assert.equal(parsed.planned, null);
  assert.equal(parsed.unstarted, null);
  assert.equal(parsed.unstarted_judgments, null);
  // An earlier collection with nothing known makes every total unknown.
  const blank = { kind: 'collection', status: 'unknown', error: null, planned: null, logged: null, exported: null,
    failed: null, omitted: null, unstarted: null, logs: [], omissions: [], unstarted_judgments: null };
  const extended = parseCollectionReport({ ...v2, planned: null, logged: null, exported: null, failed: null, omitted: null,
    unstarted: null, collections: [blank, { ...part, kind: 'extension' }] });
  assert.deepEqual([extended.planned, extended.logged, extended.omitted], [null, null, null]);
});
test('each inconsistency in a version 2 report makes it unavailable', () => {
  // Each case breaks exactly one rule, so every check is shown to matter on its own.
  const zero = { planned: 0, logged: 0, exported: 0, failed: 0, omitted: 0, unstarted: 0 };
  const cases = {
    'logged != exported + omitted': { ...v2, exported: 3, collections: [{ ...part, exported: 3 }] },
    'planned != logged + unstarted': { ...v2, planned: 5, collections: [{ ...part, planned: 5 }] },
    'totals differ from the parts': { ...v2, planned: 8, logged: 6, exported: 4, failed: 2, omitted: 2, unstarted: 2 },
    'omission rows differ from omitted': { ...v2, failed: 0, collections: [{ ...part, failed: 0, omissions: [] }] },
    'failed rows differ from failed': { ...v2, collections: [{ ...part, omissions: [{ ...omission, reason: 'not_exported' }] }] },
    'unstarted rows differ from unstarted': { ...v2, collections: [{ ...part, unstarted_judgments: [] }] },
    'unstarted known but its rows unknown': { ...v2, collections: [{ ...part, unstarted_judgments: null }] },
    'unknown part status': { ...v2, collections: [{ ...part, status: 'done' }] },
    'version 1 source': { ...v2, source: 'inspect_log' },
    'no collections': { schema_version: 2, source: 'inspect_logs', ...zero, collections: [] },
    'unknown schema version': { ...v2, schema_version: 3 },
  };
  for (const [rule, bad] of Object.entries(cases)) {
    assert.equal(parseCollectionReport(bad), null, rule);
  }
});
test('recurring judgments and unreconcilable counts parse as unknown, not 0', () => {
  // One of two identical judgments went unexported: it has no sample to name.
  const anonymous = { ...omission, sample_id: null, log_file: null, reason: 'not_exported', error: null, round: null, epoch: null };
  const recurring = { ...v2, failed: 0, collections: [{ ...part, failed: 0, omissions: [anonymous] }] };
  assert.equal(parseCollectionReport(recurring).omissions[0].sample_id, null);

  // The logs hold more than the plan asked for: planned is known, unstarted is not.
  const overfull = { ...part, unstarted: null, unstarted_judgments: null };
  const parsed = parseCollectionReport({ ...v2, unstarted: null, collections: [overfull] });
  assert.deepEqual([parsed.planned, parsed.unstarted, parsed.unstarted_judgments], [4, null, null]);

  // The export holds judgments no log accounts for: exported and omitted are unknown, failures still listed.
  const unreconciled = { ...part, exported: null, omitted: null };
  const report = parseCollectionReport({ ...v2, exported: null, omitted: null, collections: [unreconciled] });
  assert.deepEqual([report.exported, report.omitted, report.failed, report.omissions.length], [null, null, 1, 1]);
});
