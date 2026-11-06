import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assessForPractice} from '../dist/backend.js';
import {checkCertificate} from '../dist/certificate-ui.js';
import {instantiateGrader} from '../dist/lib/native-grade/runtime.js';
import {questionBank, generateMock} from '../dist/lib/questions.js';
import {makeSession, finishSession} from '../dist/lib/session.js';

const grader = await instantiateGrader(await readFile(new URL('../dist/lib/native-grade/avenquellis-grader-runtime.wasm', import.meta.url)));
const question = questionBank.find(q => q.templateId === 'number-gcd');
const full = grader.scaffold(question).replace('forward: _ _', 'forward: -1 1')
  .replace('reverse: _ _', 'reverse: 1 1')
  .replace('conclusion: _', 'conclusion: same-positive-divisors -> equal-maxima');

test('complete and partial certificates and prose work without any network request', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('The loaded native checker must not use the network.'));
  const complete = await assessForPractice(question, full, grader);
  assert.equal(complete.status, 'verified_certificate');
  assert.equal(complete.score, question.maxMarks);
  const partial = await assessForPractice(question, full.replace('reverse: 1 1', 'reverse: 1 2'), grader);
  assert.equal(partial.status, 'incomplete_certificate');
  assert.equal(partial.score, null);
  assert.equal(partial.lowerBoundPoints, 4);
  const prose = await assessForPractice(question, 'All common positive divisors are equal.', grader);
  assert.equal(prose.status, 'needs_review');
  assert.equal(prose.score, null);
});

test('a thirty-proof test finishes locally without per-answer network waits', {timeout:2000}, async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Submitting locally must not wait on a stalled network.'));
  const session = makeSession(generateMock({exam:'RMO', count:30, seed:'local-submission'}), 1000);
  for (const q of session.questions) session.answers[q.id] = 'My reasoning needs a human review.';
  const results = new Map(await Promise.all(session.questions.map(async q =>
    [q.id, await assessForPractice(q, session.answers[q.id], grader)])));
  const completed = finishSession(session, 2000, q => results.get(q.id));
  assert.equal(completed.results.length, 30);
  assert.ok(completed.results.every(r => r.score === null && r.status === 'needs_review'));
  assert.deepEqual(completed.answers, session.answers);
});

test('unavailable, broken or mismatched local engines fall back to the hosted checker', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests++;
    assert.equal(url, './api/assess');
    assert.equal(JSON.parse(options.body).questionId, question.id);
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({questionId:question.id, status:'needs_review', score:null});
  });
  for (const local of [undefined, {assess(){throw Error('WASM unavailable');}},
    {assess:() => null}, {assess:() => ({questionId:'different', status:'verified_certificate', score:10})}]) {
    const result = await assessForPractice(question, 'My proof', local);
    assert.equal(result.status, 'needs_review');
    assert.equal(result.score, null);
  }
  assert.equal(requests, 4);
});

test('failure of both checkers stays a failure instead of inventing a score', async t => {
  t.mock.method(globalThis, 'fetch', async () => {throw new TypeError('Failed to fetch');});
  await assert.rejects(assessForPractice(question, 'My proof', null), /Failed to fetch/);
});

// A static preview answers POST /api/assess with 405 text/plain, as does any host without Pages Functions.
const staticHost = async () => new Response('Method not allowed\n', {status:405, headers:{'Content-Type':'text/plain; charset=utf-8'}});

test('a non-JSON hosted reply becomes a readable failure, not a JSON parse error', async t => {
  t.mock.method(globalThis, 'fetch', staticHost);
  await assert.rejects(assessForPractice(question, 'My proof', null), {message:'Connect to Avenquellis to check this proof.'});
});

test('Check certificate uses the loaded checker while the hosted checker is unreachable', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', staticHost);
  const complete = await checkCertificate(question, full, async () => grader);
  assert.equal(complete.status, 'verified_certificate');
  assert.equal(complete.score, question.maxMarks);
  const partial = await checkCertificate(question, full.replace('reverse: 1 1', 'reverse: 1 2'), async () => grader);
  assert.equal(partial.lowerBoundPoints, 4);
  assert.equal(await checkCertificate(question, 'All common positive divisors are equal.', async () => grader), null);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('Check certificate falls back to the hosted checker only when the local one cannot load', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({questionId:question.id, status:'incomplete_certificate', score:null, lowerBoundPoints:2}));
  assert.equal((await checkCertificate(question, 'My proof', async () => {throw Error('WASM unavailable');})).lowerBoundPoints, 2);
  t.mock.method(globalThis, 'fetch', staticHost);
  await assert.rejects(checkCertificate(question, 'My proof', async () => {throw Error('WASM unavailable');}), /Connect to Avenquellis/);
});

// Startup stops waiting for a stalled checker download after eight seconds; the button must not wait on it forever.
test('Check certificate stops waiting for a stalled local checker and uses the hosted one', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({questionId:question.id, status:'incomplete_certificate', score:null, lowerBoundPoints:2}));
  let settled = false;
  const checking = checkCertificate(question, 'My proof', () => new Promise(() => {})).finally(() => {settled = true;});
  await Promise.resolve();
  t.mock.timers.tick(3000);
  for (let turn = 0; turn < 50 && !settled; turn++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(settled, 'Check certificate is still waiting for the stalled checker download.');
  assert.equal((await checking).lowerBoundPoints, 2);
  assert.equal(fetchMock.mock.callCount(), 1);
});
