// dist/app.js under the stub DOM (tests/support/stub-dom.mjs), started on work that earlier visits and the previous
// release saved: re-grading it, reports, the proof studio, finishing tests and backups. The compiled proof checker
// misses this visit's startup and arrives just after it; the hosted checker cannot be reached. The tests share that
// one app and run in order.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {createDom, createStorage} from './support/stub-dom.mjs';
import {makeSession, finishSession} from '../dist/lib/session.js';
import {questionBank} from '../dist/lib/questions.js';
import {certificateHelp, verifyCertificate} from '../dist/lib/certificate.js';
import {preloadNativeGrader} from '../dist/lib/native-grader.js';
import {validateBackup} from '../dist/lib/backup.js';

const KEY = 'avenquellis.workspace.v1';
const numeric = questionBank.filter(q => q.type === 'numeric').slice(0, 2);
const prose = questionBank.filter(q => q.type === 'proof' && !certificateHelp(q));
const [p1, p2, own] = prose;
const gcd = questionBank.find(q => q.templateId === 'number-gcd');
// A gcd certificate: with `reverse: 1 1` every step checks; with `reverse: 2 2` only part of it does.
const certificate = reverse => certificateHelp(gcd).scaffold.replace('forward: _ _', 'forward: -1 1')
  .replace('reverse: _ _', `reverse: ${reverse}`).replace('conclusion: _', 'conclusion: same-positive-divisors -> equal-maxima');
const now = Date.now(), hour = 3600000;

// A proof the checker verified in full, beside a numeric answer.
const verified = makeSession({id: 'gcd', title: 'Certificate practice', durationMinutes: 20, questions: [gcd, numeric[0]],
  maxMarks: gcd.maxMarks + numeric[0].maxMarks}, now - 5 * hour);
verified.attemptId = 'attempt-certificate';
verified.answers = {[gcd.id]: certificate('1 1'), [numeric[0].id]: String(numeric[0].answer)};
// Two proofs: one answered, one left blank.
const twoProofs = makeSession({id: 'two-proofs', title: 'Two proofs', durationMinutes: 30, questions: [p1, p2], maxMarks: 20}, now - 4 * hour);
twoProofs.attemptId = 'attempt-two-proofs';
twoProofs.answers = {[p1.id]: 'My submitted proof.'};
// The last of a long chain of retries, as earlier releases titled them (498 characters), and a draft of it exported
// before it was finished. The previous release restored that draft with the finished attempt's id.
const chainTitle = 'CMI mixed practice' + ' · retry'.repeat(60);
const retried = makeSession({id: 'cmi-mixed', title: chainTitle, durationMinutes: 180, questions: numeric, maxMarks: 20}, now - 2 * hour);
retried.attemptId = 'attempt-restored';
const restoredDraft = {...structuredClone(retried), answers: {[numeric[0].id]: '1'}};
retried.answers = Object.fromEntries(numeric.map(q => [q.id, String(q.answer)]));
const history = [finishSession(retried, now - hour), finishSession(twoProofs, twoProofs.startedAt + 600000, () => null),
  finishSession(verified, verified.startedAt + 600000, verifyCertificate)];
// Checked here before the app loads the C++ engine, so a result the app saves shows that it was re-checked.
const fallback = history[2].results[1].checker;
// The learner's own draft comes first among 522 draft slots; opening forged questions left 520 of them empty.
const mine = 'An argument of my own.';
const proofDrafts = {[own.id]: mine, [gcd.id]: certificate('2 2'),
  ...Object.fromEntries(Array.from({length: 520}, (_, i) => ['forged-' + i, '']))};
const storage = createStorage({initial: {[KEY]: JSON.stringify({history, reviews: [], session: restoredDraft, proofDraft: mine,
  proofId: own.id, paused: false, reviewQuestion: null, proofDrafts, proofAttemptId: null, reviewAttemptId: null, bookmarks: []})}});
let graderRequests = 0;
const dom = createDom({dist: fileURLToPath(new URL('../dist/', import.meta.url)), hash: '#progress', storage, fetchImpl: (input, init, files) => {
  const url = String(input?.url ?? input);
  // Startup's request for the compiled proof checker fails; the app's next one loads it.
  if (url.includes('avenquellis-grader-runtime.wasm') && ++graderRequests === 1) return Promise.reject(new TypeError('Failed to fetch'));
  if (url.includes('/api/assess')) return Promise.reject(new TypeError('Failed to fetch'));
  return files(input, init);
}});
await import(dom.appUrl);
await sleep(50);

const stored = () => JSON.parse(storage.getItem(KEY));
const toast = () => dom.$('#toast').textContent;
// Leaving or hiding the page saves at once whatever was waiting for a pause.
const saveNow = () => dom.win.dispatchEvent(new Event('pagehide'));
// Like the app's go(): choosing the page that is already open draws it again.
async function goto(page) {
  if (dom.loc.hash === '#' + page) dom.win.dispatchEvent(new Event('hashchange'));
  else dom.loc.hash = page;
  await sleep(10);
}
async function until(done, what) {
  for (let i = 0; !done(); i++) {
    if (i > 500) assert.fail('timed out waiting for ' + what);
    await sleep(10);
  }
}
const report = async id => { await goto('progress'); dom.$(`[data-report="${id}"]`).click(); await sleep(10); };

test('a visit on which the proof checker does not load keeps the verified certificate marks saved before', async () => {
  assert.match(dom.main.innerHTML, /<strong>3<\/strong><small>Completed sessions/);
  saveNow();
  const saved = stored().history.find(a => a.attemptId === 'attempt-certificate');
  // The visit re-checked the numeric answer with the C++ engine and saved the result.
  assert.notEqual(fallback, 'axiom-cpp-wasm');
  assert.equal(saved.results[1].checker, 'axiom-cpp-wasm');
  assert.equal(saved.results[1].score, numeric[0].maxMarks);
  assert.equal(saved.results[0].status, 'verified_certificate');
  assert.equal(saved.results[0].score, gcd.maxMarks);
  assert.equal(saved.results[0].certificate?.complete, true);
  await report('attempt-certificate');
  assert.match(dom.main.innerHTML, new RegExp(`Verified proof: ${gcd.maxMarks}/${gcd.maxMarks}`));
});

test('a blank proof needs no review, and an edited copy of a submitted proof opens again from its report', async () => {
  await report('attempt-two-proofs');
  assert.match(dom.main.innerHTML, /1 response needs review/);
  assert.match(dom.main.innerHTML, /No response/);
  assert.match(dom.main.innerHTML, /Write this proof/);
  assert.match(dom.main.innerHTML, /Needs human review/);
  const slot = `attempt-two-proofs:${p1.id}`;
  const reopen = async () => {
    await report('attempt-two-proofs');
    dom.$$('[data-review-q]')[0].click();
    await sleep(10);
    assert.equal(dom.loc.hash, '#proof');
    return dom.$('#proof-answer');
  };
  let field = await reopen();
  assert.equal(field.value, 'My submitted proof.');
  assert.equal(dom.$('#show-submitted'), null);
  field.value = 'My submitted proof. Revised.';
  field.dispatchEvent(new Event('input'));
  saveNow();
  assert.equal(stored().proofDrafts[slot], 'My submitted proof. Revised.');
  // Reopened from its report, the edited copy comes back, with the submitted answer one click away.
  field = await reopen();
  assert.equal(field.value, 'My submitted proof. Revised.');
  assert.match(dom.main.innerHTML, /You are editing a copy of your submitted answer/);
  dom.$('#show-submitted').click();
  assert.equal(dom.$('#proof-answer').value, 'My submitted proof.');
  assert.match(dom.main.innerHTML, /This is your submitted answer\. Your edited copy is saved/);
  await goto('overview');
  saveNow();
  assert.equal(stored().proofDrafts[slot], 'My submitted proof. Revised.', 'showing the submitted answer keeps the edited copy');
  await goto('proof');
  dom.$('#show-edited').click();
  assert.equal(dom.$('#proof-answer').value, 'My submitted proof. Revised.');
});

test("a symbol button stops at the editor's 50,000-character limit", async () => {
  const field = dom.$('#proof-answer');
  assert.equal(field.maxLength, 50000);
  field.value = 'y'.repeat(50000);
  field.selectionStart = field.selectionEnd = 50000;
  field.dispatchEvent(new Event('input'));
  dom.$$('[data-insert]')[0].click();
  assert.equal(field.value.length, 50000);
  assert.equal(toast(), 'Your argument has reached the 50,000-character limit.');
  // Check arithmetic still answers at the limit, and a symbol below it goes in.
  dom.$('#audit-proof').click();
  assert.match(dom.$('#arithmetic-feedback').innerHTML, /0 arithmetic equalities checked/);
  field.value = 'ab';
  field.selectionStart = field.selectionEnd = 2;
  field.dispatchEvent(new Event('input'));
  dom.$$('[data-insert]')[0].click();
  assert.equal(field.value, 'ab∀');
  saveNow();
  assert.equal(stored().proofDrafts[`attempt-two-proofs:${p1.id}`], 'ab∀');
});

test('Check certificate uses the checker on this device when the hosted one cannot be reached', async () => {
  const select = dom.$('#proof-question');
  select.value = gcd.id;
  select.dispatchEvent(new Event('change'));
  assert.equal(dom.$('#proof-answer').value, certificate('2 2'));
  const check = dom.$$('button').find(b => b.textContent === 'Check certificate');
  assert.ok(check, 'the certificate guide offers a check');
  check.click();
  const output = dom.$('[data-certificate-result]');
  await until(() => output.innerHTML || output.textContent, 'the certificate check');
  assert.match(output.innerHTML, /Certificate needs review/);
  assert.match(output.innerHTML, /4 \/ 10 marks verified so far/);
});

test('Prepare review on an incomplete certificate shows its verified marks as a lower bound, with the assessment form', async () => {
  // The compiled checker that missed startup has arrived.
  await preloadNativeGrader();
  assert.equal(dom.$('#proof-answer').value, certificate('2 2'));
  dom.$('#assess').click();
  await until(() => dom.$('#proof-feedback').innerHTML, 'the prepared review');
  const feedback = dom.$('#proof-feedback').innerHTML;
  assert.match(feedback, /4 \/ 10 marks verified so far/);
  assert.match(feedback, /id="review-form"/);
  assert.doesNotMatch(feedback, /AWAITING HUMAN REVIEW/);
});

test("a test the previous release restored under a finished attempt's id finishes as an attempt of its own", async () => {
  await goto('session');
  assert.equal(dom.$('#session-answer').value, '1');
  dom.$('#submit-session').click();
  dom.$('#confirm-finish').click();
  await sleep(10);
  assert.equal(dom.loc.hash, '#report');
  const ids = stored().history.map(a => a.attemptId);
  assert.equal(ids.length, 4);
  assert.equal(new Set(ids).size, 4, 'every attempt keeps an id of its own');
  assert.equal(ids[1], 'attempt-restored', 'the finished attempt keeps its id');
  assert.equal(stored().history[0].answers[numeric[0].id], '1');
});

test('Retry this set stops lengthening a title at the 500 characters earlier releases restore', async () => {
  // The report of the attempt just finished, the last of a long chain of retries.
  assert.match(dom.main.innerHTML, /CMI mixed practice · retry/);
  dom.$('#retry-session').click();
  await sleep(10);
  assert.equal(dom.loc.hash, '#session');
  assert.equal(stored().session.title, chainTitle);
});

test('a clock that steps back during a test leaves an attempt that does not finish before it started', async () => {
  const field = dom.$('#session-answer');
  field.value = '42';
  field.dispatchEvent(new Event('input'));
  saveNow();
  const started = stored().session.startedAt, realNow = Date.now;
  // The device clock is corrected five minutes back.
  Date.now = () => started - 300000;
  try {
    dom.$('#submit-session').click();
    dom.$('#confirm-finish').click();
  } finally {
    Date.now = realNow;
  }
  await sleep(10);
  const after = stored();
  assert.equal(after.session, null);
  assert.equal(after.history.length, 5);
  assert.equal(after.history[0].answers[numeric[0].id], '42');
  assert.ok(after.history[0].finishedAt >= after.history[0].startedAt, 'its finish time does not precede its start');
});

test('a backup keeps the oldest draft the learner wrote past 500 draft slots, and restores every attempt as saved', async () => {
  await goto('progress');
  dom.$('#export-backup').click();
  const backup = JSON.parse(await dom.blobs.at(-1).text());
  assert.equal(backup.proofDrafts[own.id], mine);
  assert.equal(backup.proofDrafts[gcd.id], certificate('2 2'));
  assert.ok(Object.keys(backup.proofDrafts).length <= 500);
  assert.doesNotMatch(toast(), /leaves out/, 'nothing the learner wrote was left out');
  const restored = validateBackup(backup);
  assert.equal(restored.proofDrafts[own.id], mine);
  assert.deepEqual(restored.history.map(a => [a.attemptId, a.title.length, a.finishedAt >= a.startedAt]),
    backup.history.map(a => [a.attemptId, a.title.length, true]));
});
