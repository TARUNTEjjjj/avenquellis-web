/** Regression check, run in CI, for navigation, reload and a dropped connection while a submission is being assessed. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createStaticServer} from '../scripts/serve.mjs';
import {generateMock} from '../dist/lib/questions.js';
import {makeSession} from '../dist/lib/session.js';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');
const server = createStaticServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE});
let release;
async function exercisePendingSubmission(restoreAnotherDraft) {
  const context = await browser.newContext({serviceWorkers:'block'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Exercise the hosted fallback deliberately; a healthy local checker finishes immediately.
  await page.route('**/lib/native-grade/*.wasm', route => route.abort());
  await page.route('**/api/generate', route => route.fulfill({json:{
    engine:'cpp-wasm', result:generateMock({exam:'RMO', count:6, seed:'submission-regression'})
  }}));
  await page.route('**/api/grade-status', route => route.fulfill({json:{available:false}}));
  let markRequested;
  const requested = new Promise(resolve => {markRequested = resolve;});
  const held = new Promise(resolve => {release = resolve;});
  await page.route('**/api/assess', async route => {
    markRequested();
    await held;
    // The first page can close its pending request when it reloads.
    await route.fulfill({json:{questionId:route.request().postDataJSON().questionId,
      status:'needs_review', score:null}}).catch(() => {});
  });
  await page.goto(origin + '/#generator');
  await page.locator('#gen-exam').selectOption('RMO');
  await page.locator('#assemble').click();
  await page.locator('#start-generated-mock').click();
  await page.locator('#session-answer').fill('My submitted proof.');
  await page.locator('#submit-session').click();
  await page.locator('#confirm-finish').click();
  await requested;
  await page.locator('a[data-page="overview"]').click();
  await page.locator('[data-go="session"]').click();
  await page.getByRole('heading', {name:'Checking your attempt…'}).waitFor();
  assert.deepEqual(errors, []);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('avenquellis.workspace.v1')));
  assert(Number.isSafeInteger(saved.session.submittedAt));
  if (restoreAnotherDraft) {
    const replacement = makeSession(generateMock({exam:'RMO', count:6, seed:'replacement'}));
    replacement.answers[replacement.questions[0].id] = 'Replacement saved work';
    await page.locator('a[data-page="progress"]').click();
    await page.locator('#import-backup').setInputFiles({name:'active-draft.json', mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(replacement))});
    await page.locator('#confirm-import').click();
    await page.locator('a[data-page="overview"]').click();
    await page.locator('[data-go="session"]').click();
    await page.locator('#session-answer').waitFor();
    assert.equal(await page.locator('#session-answer').inputValue(), 'Replacement saved work');
    release();
    // Finishing the replacement must still be possible while the original response settles.
    await page.locator('#submit-session').click();
    await page.locator('#confirm-finish').click();
    await page.locator('.result-number').waitFor();
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('avenquellis.workspace.v1')));
    assert.equal(state.session, null);
    assert.equal(state.history.length, 1);
    assert.equal(state.history[0].attemptId, replacement.attemptId);
    assert.equal(state.history[0].answers[replacement.questions[0].id], 'Replacement saved work');
    assert.deepEqual(errors, []);
    await context.close();
    console.log('Restoring and finishing another draft cannot inherit the abandoned submission state.');
    return;
  }
  await page.reload();
  await page.getByRole('heading', {name:'Checking your attempt…'}).waitFor();
  assert.equal(await page.locator('#session-answer').count(), 0);
  release();
  await page.locator('.result-number').waitFor();
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('avenquellis.workspace.v1')));
  assert.equal(restored.session, null);
  assert.equal(restored.history.length, 1);
  assert.equal(restored.history[0].finishedAt, saved.session.submittedAt);
  assert.deepEqual(restored.history[0].answers, saved.session.answers);
  assert.deepEqual(errors, []);
  console.log('Submission survived navigation and reload with one saved attempt and its original answer and timestamp.');
  await context.close();
}
// A dropped connection fails like the request a reload cancels, but this page stays open and must ask again.
async function exerciseLostConnection(recovers) {
  const context = await browser.newContext({serviceWorkers:'block'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/lib/native-grade/*.wasm', route => route.abort());
  await page.route('**/api/generate', route => route.fulfill({json:{
    engine:'cpp-wasm', result:generateMock({exam:'RMO', count:6, seed:'submission-regression'})
  }}));
  await page.route('**/api/grade-status', route => route.fulfill({json:{available:false}}));
  let requests = 0, markRetried;
  const retried = new Promise(resolve => {markRetried = resolve;});
  const held = new Promise(resolve => {release = resolve;});
  await page.route('**/api/assess', async route => {
    if (++requests === 1 || !recovers) return route.abort('failed');
    markRetried();
    await held;
    await route.fulfill({json:{questionId:route.request().postDataJSON().questionId, status:'incomplete_certificate',
      complete:false, score:null, lowerBoundPoints:4, maxMarks:10, criteria:[], feedback:[]}});
  });
  await page.goto(origin + '/#generator');
  await page.locator('#gen-exam').selectOption('RMO');
  await page.locator('#assemble').click();
  await page.locator('#start-generated-mock').click();
  await page.locator('#session-answer').fill('My submitted proof.');
  await page.locator('#submit-session').click();
  await page.locator('#confirm-finish').click();
  if (recovers) {
    // Until the second request is answered the attempt must still be the pending submission.
    await Promise.race([retried, page.locator('.result-number').waitFor().catch(() => {})]);
    const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('avenquellis.workspace.v1')));
    assert(Number.isSafeInteger(pending.session?.submittedAt), 'The attempt was saved as finished without asking the checker again.');
    assert.equal(pending.history.length, 0);
    release();
  }
  await page.locator('.result-number').waitFor();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('avenquellis.workspace.v1')));
  assert.equal(state.session, null);
  assert.equal(state.history.length, 1);
  const proof = state.history[0].results[0];
  assert.equal(proof.answer, 'My submitted proof.');
  if (recovers) {
    assert.equal(requests, 2);
    assert.equal(proof.certificate.lowerBoundPoints, 4);
  } else {
    assert.ok(requests > 1, 'An unreachable checker must be asked again before the attempt is saved unchecked.');
    assert.equal(proof.status, 'needs_review');
    assert.equal(proof.certificate, undefined);
  }
  assert.deepEqual(errors, []);
  await context.close();
  console.log(recovers
    ? 'A check cut off by a dropped connection stayed pending and was answered on the next try.'
    : 'A checker that stayed out of reach did not hold the attempt back: it was saved for review.');
}
try {
  await exercisePendingSubmission(false);
  await exercisePendingSubmission(true);
  await exerciseLostConnection(true);
  await exerciseLostConnection(false);
} finally {
  release?.();
  await browser.close();
  server.close();
}
