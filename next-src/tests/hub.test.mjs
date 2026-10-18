import assert from 'node:assert/strict';
import test from 'node:test';
import {
  agreement, baseName, boardName, formatRank, groupOf, rankSpread, runningBest, scoreFromShare, spearman, topLabs, trustShare,
} from '../src/lib/hub.ts';

const row = (model_name, elo_mean, lo, hi) => ({ model_name, elo_mean, elo_ci_lower: lo, elo_ci_upper: hi });

test('overlapping intervals share a rank range; separated ones do not', () => {
  const spread = rankSpread([
    row('a', 1636, 1622, 1650),
    row('b', 1559, 1529, 1587),
    row('c', 1550, 1520, 1580),
    row('d', 1400, 1390, 1410),
  ]);
  assert.deepEqual(spread.get('a'), { best: 1, worst: 1 });
  assert.deepEqual(spread.get('b'), { best: 2, worst: 3 });
  assert.deepEqual(spread.get('c'), { best: 2, worst: 3 });
  assert.deepEqual(spread.get('d'), { best: 4, worst: 4 });
  assert.equal(formatRank(spread.get('b')), '2–3');
  assert.equal(formatRank(spread.get('a')), '1');
});

test('a model without an interval ranks by its mean alone', () => {
  const spread = rankSpread([row('a', 1600), row('b', 1500, 1450, 1650)]);
  assert.deepEqual(spread.get('a'), { best: 1, worst: 2 });
  assert.deepEqual(spread.get('b'), { best: 1, worst: 2 });
});

test('trust share and score are inverses, and a fair share scores 1500', () => {
  assert.equal(scoreFromShare(1 / 8, 8), 1500);
  const share = trustShare(1636, 8);
  assert.ok(Math.abs(share - 0.2735) < 0.001);
  assert.ok(Math.abs(scoreFromShare(share, 8) - 1636) < 1e-9);
});

test('running best keeps only the dates where the leader improves', () => {
  const steps = runningBest([
    { name: 'late-weak', date: '2025-06-01', score: 1400 },
    { name: 'early', date: '2024-01-01', score: 1500 },
    { name: 'better', date: '2025-01-01', score: 1550 },
    { name: 'same-day-worse', date: '2025-01-01', score: 1520 },
  ]);
  assert.deepEqual(steps.map(s => s.name), ['early', 'better']);
});

test('spearman handles order, reversal, ties and too little data', () => {
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  assert.equal(spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1);
  assert.ok(Math.abs(spearman([1, 2, 2, 3], [1, 2, 3, 4]) - 0.9487) < 1e-3);
  assert.equal(spearman([1, 2], [3, 4]), null);
  assert.equal(spearman([1, 1, 1], [1, 2, 3]), null);
});

test('lenses group models, leaving out those a lens does not cover', () => {
  const us = { lab: 'OpenAI', country: 'US', open: false };
  const cn = { lab: 'Qwen', country: 'CN', open: true };
  const eu = { lab: 'Mistral', country: 'EU', open: true };
  assert.equal(groupOf(us, 'license', []), 'Proprietary');
  assert.equal(groupOf(cn, 'license', []), 'Open weights');
  assert.equal(groupOf(cn, 'country', []), 'China');
  assert.equal(groupOf(eu, 'country', []), null);
  assert.equal(groupOf(eu, 'labs', ['OpenAI', 'Qwen']), null);
  assert.deepEqual(topLabs([us, us, cn, eu, eu], 2), ['Mistral', 'OpenAI']);
});

test('names read cleanly', () => {
  assert.equal(boardName('Lockean_Rights_Constitution'), 'Lockean Rights');
  assert.equal(boardName('deep_ecology'), 'Deep Ecology');
  assert.equal(boardName('oct_loving'), 'Loving');
  assert.equal(baseName('Grok 4.3 (reasoning)'), 'Grok 4.3');
});

test('agreement words follow the size and sign of rho', () => {
  assert.equal(agreement(0.1), 'Little agreement');
  assert.equal(agreement(0.45), 'Moderate agreement');
  assert.equal(agreement(-0.85), 'Very strong inverse agreement');
});
