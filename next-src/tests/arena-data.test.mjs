import assert from 'node:assert/strict';
import test from 'node:test';
import { modelMatch, profileURL, publishedBoards, rankedRows, rowStrength, scoreInterval, scoreRank, valueId } from '../src/lib/arena-data.ts';

const run = (slug, constitution, extra = {}) => ({ slug, constitution, timestamp: '2026-01-01', ...extra });
const row = (model_name, elo_mean, extra = {}) => ({ model_name, elo_mean, model_index: 0, ...extra });

test('defaults prefer a shared frontier panel, while explicit runs take precedence', () => {
  const runs = [run('wide', 'kindness', { models_count: 37 }), run('featured', 'kindness', { models_count: 8, group: 'frontier-direct-ratings-200' }), run('humor', 'oct_humor')];
  assert.equal(publishedBoards(runs)[0].run.slug, 'featured');
  assert.equal(publishedBoards(runs, 'wide')[0].run.slug, 'wide');
  assert.equal(publishedBoards(runs)[1].id, 'humor');
  assert.deepEqual(runs.map(r => r.slug), ['wide', 'featured', 'humor']);
});

test('fallback selection uses model coverage, then recency, without dropping run history', () => {
  const boards = publishedBoards([run('old', 'humor', { models_count: 8 }), run('new', 'oct_humor', { models_count: 8, timestamp: '2026-02-01' }), run('small', 'humor', { models_count: 3, timestamp: '2026-03-01' })]);
  assert.equal(boards.length, 1);
  assert.equal(boards[0].run.slug, 'new');
  assert.equal(boards[0].runs.length, 3);
});

test('generic metadata only resolves recognized value names; unknown runs do not become values', () => {
  assert.equal(valueId(run('group/sarcasm', 'constitution')), 'sarcasm');
  assert.equal(valueId(run('group/mystery', 'constitution')), '');
  assert.equal(valueId(run('loving-checkpoints-plus-dpo200', '')), '');
  assert.equal(valueId(run('frontier/taoism', 'Taoism_Constitution')), 'taoism_constitution');
});

test('model matching preserves exact variants and refuses ambiguous normalized names', () => {
  const rows = [row('Claude 4.0 Sonnet', 1600), row('Claude-4-Sonnet', 1590), row('GPT 5', 1500)];
  assert.equal(modelMatch(rows, 'Claude-4-Sonnet').elo_mean, 1590);
  assert.equal(modelMatch(rows, 'claude4sonnet'), undefined);
  assert.equal(modelMatch(rows, 'gpt-5').model_name, 'GPT 5');
  assert.equal(modelMatch(rows, 'GPT 5 thinking'), undefined);
});

test('ranks handle ties, nonfinite scores, and duplicate rows without inventing missing intervals', () => {
  const rows = rankedRows([row('B', 1500), row('A', 1600), row('C', 1500), row('A', 1600), row('bad', NaN)]);
  assert.deepEqual(rows.map(r => r.model_name), ['A', 'B', 'C']);
  assert.equal(scoreRank(rows, rows[1]), 2);
  assert.equal(scoreRank(rows, rows[2]), 2);
  assert.equal(scoreInterval(rows[0]), null);
  assert.equal(scoreInterval(row('A', 1600, { elo_ci_lower: 1620, elo_ci_upper: 1580 })), null);
  assert.equal(scoreInterval(row('A', 1600, { elo_ci_lower: 1580, elo_ci_upper: 1620 })), '1580.0–1620.0');
  assert.equal(rowStrength(rows, rows[0]), 1);
  assert.equal(rowStrength(rows.slice(1), rows[1]), .5);
});

test('model profile URLs retain exact model and source run identifiers', () => {
  const url = new URL(profileURL('GPT 5 + prompted', 'group/run'), 'https://valuearena.github.io');
  assert.equal(url.searchParams.get('id'), 'GPT 5 + prompted');
  assert.equal(url.searchParams.get('run'), 'group/run');
});
