import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBackup} from '../dist/lib/backup.js';
import {rememberModelReview, modelReviewRecords, storedModelReviews, modelResult, replaceModelReviews} from '../dist/model-review.js';

const question = {id: 'sample', type: 'proof', statement: 'Prove the identity.', rubric: [{id: 'c1', description: 'Justify the identity.', points: 4}]};
function review(provider, points = [3, 3]) {
  const readers = points.map((score, i) => ({number: i + 1, status: 'proposal', score, rationale: 'A reason.', gaps: []}));
  return {provider, model: 'research-model', promptVersion: 'one', date: new Date(0).toISOString(), max: 4,
    suggested: points[0] === points[1] ? points[0] : null, reviews: readers,
    criteria: [{id: 'c1', description: 'Justify the identity.', maxPoints: 4,
      reviewers: points.map((score, i) => ({reviewer: i + 1, points: score, quotes: ['<proof>']}))}]};
}
function storage() {
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {configurable: true,
    value: {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)}});
  return values;
}
const backup = records => ({schema: 'noether-backup-v1', history: [], reviews: [], modelReviews: records});

test('retains both providers, updates only the matching provider and binds to the exact answer', async () => {
  storage();
  assert.equal(await rememberModelReview(question, 'answer', review('workers-ai')), true);
  assert.equal(await rememberModelReview(question, 'answer', review('browser-webllm', [4, 1])), true);
  assert.equal(await rememberModelReview(question, 'answer', review('browser-webllm', [0, 2])), true);
  const saved = await storedModelReviews(question, 'answer');
  assert.deepEqual(saved.map(r => r.provider), ['workers-ai', 'browser-webllm']);
  assert.deepEqual(saved.map(r => r.suggested), [3, null]);
  assert.equal(saved[1].range.max, 2);
  assert.deepEqual(await storedModelReviews(question, 'edited answer'), []);
});

test('round trips both providers and marks imported records visibly unverified', async () => {
  storage();
  for (const provider of ['workers-ai', 'browser-webllm']) await rememberModelReview(question, 'answer', review(provider));
  const records = JSON.parse(JSON.stringify(modelReviewRecords()));
  const restored = validateBackup(backup(records)).modelReviews;
  assert.equal(restored.length, 2);
  assert.ok(restored.every(row => row.review.imported));
  assert.ok(replaceModelReviews(restored));
  const report = (await storedModelReviews(question, 'answer')).map(modelResult).join('');
  assert.match(report, /Imported practice review/);
  assert.match(report, /&lt;proof&gt;/);
  assert.doesNotMatch(report, /<proof>/);
  assert.equal(validateBackup({schema: 'noether-backup-v1', history: [], reviews: []}).modelReviews, null);
  assert.deepEqual(validateBackup(backup([])).modelReviews, []);
  for (const mutate of [
    a => a.push(a[0]), a => {a[0].key = '__proto__';}, a => {a[0].review.provider = 'official';},
    a => {a[0].review.criteria[0].reviewers[0].points = 7;}, a => {a[0].review.suggested = 0;},
    a => {a[0].review.reviews[0].rationale = 'a'.repeat(10001);},
    a => {a[0].review.criteria[0].reviewers = [{}];},
  ]) {
    const damaged = structuredClone(records); mutate(damaged);
    assert.throws(() => validateBackup(backup(damaged)), /Invalid backup/);
  }
});

test('evicts providers as a pair after twenty distinct answers and preserves older single-provider shape', async () => {
  const values = storage();
  await rememberModelReview(question, 'first', review('workers-ai'));
  await rememberModelReview(question, 'first', review('browser-webllm'));
  const original = JSON.parse(values.get('noether.prose-reviews.v1'));delete original[0].review.imported;
  values.set('noether.prose-reviews.v1', JSON.stringify([original[0]]));
  assert.equal((await storedModelReviews(question, 'first')).length, 1);
  await rememberModelReview(question, 'first', review('workers-ai'));
  for (let i = 1; i <= 20; i++) await rememberModelReview(question, `other ${i}`, review('workers-ai'));
  assert.deepEqual(await storedModelReviews(question, 'first'), []);
  assert.equal(modelReviewRecords().length, 20);
});
