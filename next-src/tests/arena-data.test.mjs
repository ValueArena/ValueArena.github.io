import assert from 'node:assert/strict';
import test from 'node:test';
import { modelMatch, profileURL, publishedBoards, rankedRows, rowStrength, scoreInterval, scoreRank, valueId } from '../src/lib/arena-data.ts';

const run = (slug, constitution, extra = {}) => ({ slug, constitution, timestamp: '2026-01-01', ...extra });
const row = (model_name, elo_mean, extra = {}) => ({ model_name, elo_mean, model_index: 0, ...extra });

test('boards come only from the results runs, ordered and named like the site', () => {
  const runs = [run('frontier/kindness', 'kindness', { models_count: 8 }), run('nov22-50x9-primary/utilitarianism', 'utilitarianism', { models_count: 9 }),
    run('nov22-50x9-primary/care_ethics', 'care_ethics', { models_count: 9 }), run('oct26/marxism', 'marxism')];
  const boards = publishedBoards(runs);
  assert.deepEqual(boards.map(b => [b.id, b.run.slug]), [['care-ethics', 'nov22-50x9-primary/care_ethics'], ['utilitarianism', 'nov22-50x9-primary/utilitarianism']]);
  assert.deepEqual(runs.map(r => r.slug), ['frontier/kindness', 'nov22-50x9-primary/utilitarianism', 'nov22-50x9-primary/care_ethics', 'oct26/marxism']);
});

test('an explicit results run takes precedence over coverage and recency', () => {
  const runs = [run('nov22-50x9-primary/islam', 'islam', { models_count: 9 }), run('nov22-50x9-primary/islam-rerun', 'islam', { models_count: 8, timestamp: '2026-12-01' })];
  assert.equal(publishedBoards(runs)[0].run.slug, 'nov22-50x9-primary/islam');
  assert.equal(publishedBoards(runs, 'nov22-50x9-primary/islam-rerun')[0].run.slug, 'nov22-50x9-primary/islam-rerun');
  assert.equal(publishedBoards(runs)[0].runs.length, 2);
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
