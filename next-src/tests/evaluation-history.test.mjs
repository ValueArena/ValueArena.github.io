import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAcceptedRuns } from '../src/lib/evaluation-history.ts';
test('delayed empty polls cannot hide multiple accepted submissions', () => {
  const first = {id:'one',state:'queued'}, second = {id:'two',state:'queued'};
  const accepted = new Map([[first.id,first],[second.id,second]]);
  assert.deepEqual(mergeAcceptedRuns([],accepted),[first,second]);
  const running = {...first,state:'running'};
  assert.deepEqual(mergeAcceptedRuns([running],accepted),[second,running]);
  assert.deepEqual([...accepted.keys()],['two']);
  assert.deepEqual(mergeAcceptedRuns([running,second],accepted),[running,second]);
  assert.equal(accepted.size,0);
});
