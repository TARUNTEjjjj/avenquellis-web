import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {retryInterrupted} from '../dist/lib/interrupted-check.js';
import {assessForPractice} from '../dist/backend.js';
import {questionBank} from '../dist/lib/questions.js';

const question = questionBank.find(q => q.templateId === 'number-gcd');
const answered = {questionId:question.id, status:'needs_review', score:null};
// What fetch reports when a reload, a suspended tab or a dropped connection ends the request.
const cutOff = () => new TypeError('Failed to fetch');
// A page that stays open always gets past the pause. Record it instead of waiting.
function openPage() {
  const pauses = [];
  return {pauses, wait:async ms => {
    if (pauses.push(ms) > 20) throw Error('The checker was asked without end.');
  }};
}

test('a hosted check cut off by a dropped connection is asked again and its answer is kept', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    if (++requests === 1) throw cutOff();
    return Response.json(answered);
  });
  const page = openPage();
  const ask = retryInterrupted({wait:page.wait});
  assert.deepEqual(await ask(() => assessForPractice(question, 'My proof', null)), answered);
  assert.equal(requests, 2);
  assert.deepEqual(page.pauses, [1000]);
});

test('a page being unloaded concludes nothing from the check its reload cancelled', async () => {
  // Timers do not fire again in a page that is going away, so its pause never ends.
  let requests = 0, concluded = false;
  const ask = retryInterrupted({wait:() => new Promise(() => {})});
  const conclude = () => { concluded = true; };
  ask(async () => { requests++; throw cutOff(); }).then(conclude, conclude);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(concluded, false, 'The cancelled check was treated as an unreachable checker.');
  assert.equal(requests, 1);
});

test('a checker that stays out of reach is given up after two retries, each after a pause', async () => {
  let requests = 0;
  const unreachable = async () => { requests++; throw cutOff(); };
  const page = openPage();
  const ask = retryInterrupted({wait:page.wait});
  await assert.rejects(ask(unreachable), /Failed to fetch/);
  assert.equal(requests, 3);
  // The last failure is followed by a pause too: it could be the one a reload caused.
  assert.deepEqual(page.pauses, [1000, 1000, 1000]);
  // The remaining proofs of that submission do not wait for the unreachable checker again.
  await assert.rejects(ask(unreachable), /Failed to fetch/);
  assert.equal(requests, 3);
  assert.equal(page.pauses.length, 3);
});

test('two checks sent together stop asking together, and a new submission asks again', async () => {
  let requests = 0;
  const unreachable = async () => { requests++; throw cutOff(); };
  const page = openPage();
  const ask = retryInterrupted({wait:page.wait});
  const outcomes = await Promise.allSettled([ask(unreachable), ask(unreachable)]);
  assert.deepEqual(outcomes.map(outcome => outcome.status), ['rejected', 'rejected']);
  assert.equal(requests, 6);
  const next = retryInterrupted({wait:page.wait});
  assert.equal(await next(async () => 'answered'), 'answered');
});

test('a response cut off part way and an aborted transfer are asked again', async t => {
  const page = openPage();
  for (const failure of [
    () => new Response(new ReadableStream({start(controller) { controller.error(new TypeError('network error')); }}),
      {headers:{'Content-Type':'application/json'}}),
    () => { throw new DOMException('The operation was aborted.', 'AbortError'); },
  ]) {
    let requests = 0;
    t.mock.method(globalThis, 'fetch', async () => ++requests === 1 ? failure() : Response.json(answered));
    const ask = retryInterrupted({wait:page.wait});
    assert.deepEqual(await ask(() => assessForPractice(question, 'My proof', null)), answered);
    assert.equal(requests, 2);
  }
  assert.deepEqual(page.pauses, [1000, 1000]);
});

test('a checker error, an error page, a malformed reply and the deadline are final at once', async t => {
  const page = openPage();
  const ask = retryInterrupted({wait:page.wait});
  for (const [reply, expected] of [
    [() => Response.json({error:{message:'Checker failed.'}}, {status:500}), /Checker failed\./],
    [() => new Response('<h1>Not found</h1>', {status:404, headers:{'Content-Type':'text/html'}}), /Connect to Avenquellis/],
    [() => new Response('{', {headers:{'Content-Type':'application/json'}}), SyntaxError],
    [() => { throw new DOMException('The operation timed out.', 'TimeoutError'); }, {name:'TimeoutError'}],
  ]) {
    let requests = 0;
    t.mock.method(globalThis, 'fetch', async () => { requests++; return reply(); });
    await assert.rejects(ask(() => assessForPractice(question, 'My proof', null)), expected);
    assert.equal(requests, 1);
  }
  assert.deepEqual(page.pauses, []);
  // None of these mean the checker is out of reach, so later checks still ask it.
  t.mock.method(globalThis, 'fetch', async () => Response.json(answered));
  assert.deepEqual(await ask(() => assessForPractice(question, 'My proof', null)), answered);
});

test('the default pause is a real timer, which a page being unloaded never sees fire', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  let requests = 0, settled = false;
  const ask = retryInterrupted();
  const pending = ask(async () => {
    if (++requests === 1) throw cutOff();
    return 'answered';
  }).finally(() => { settled = true; });
  for (let turn = 0; turn < 5; turn++) await Promise.resolve();
  assert.equal(requests, 1);
  t.mock.timers.tick(999);
  for (let turn = 0; turn < 5; turn++) await Promise.resolve();
  assert.equal(settled, false);
  t.mock.timers.tick(1);
  assert.equal(await pending, 'answered');
  assert.equal(requests, 2);
});

// The browser check of this path is not part of `npm test`; keep the wiring covered here.
test('finishing a test asks the hosted checker through the retry', async () => {
  const source = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
  const complete = source.slice(source.indexOf('async function complete()'), source.indexOf('function referenceQuestion('));
  assert.match(complete, /const hostedCheck = retryInterrupted\(\);/);
  assert.match(complete, /await hostedCheck\(\(\) => assessForPractice\(question, answer, nativeGrader\)\)/);
  assert.equal(complete.match(/assessForPractice\(/g).length, 1, 'Every hosted check of a submitted test must be retried when cut off.');
});
