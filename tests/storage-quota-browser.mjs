/** Optional regression check: a long history that fills browser storage must not stop a finished test from saving. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createStaticServer} from '../scripts/serve.mjs';
import {generateMock, questionBank} from '../dist/lib/questions.js';
import {makeSession, finishSession} from '../dist/lib/session.js';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');
const KEY = 'avenquellis.workspace.v1';
const server = createStaticServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE});
const proof = label => `${label}. `.padEnd(4000, 'x');
const workspace = history => ({history, reviews:[], session:null, proofDraft:'', proofId:questionBank.find(q => q.type === 'proof').id,
  paused:true, reviewQuestion:null, proofDrafts:{}, proofAttemptId:null, reviewAttemptId:null, bookmarks:[]});
try {
  const context = await browser.newContext({serviceWorkers:'block'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const mock = generateMock({exam:'RMO', count:6, seed:'storage-full-new-test'});
  await page.route('**/api/generate', route => route.fulfill({json:{engine:'cpp-wasm', result:mock}}));
  await page.route('**/api/grade-status', route => route.fulfill({json:{available:false}}));
  await page.goto(origin + '/#overview');
  await page.locator('.local-status').waitFor();
  // Characters this browser keeps for the origin (keys and values together).
  const capacity = await page.evaluate(() => {
    localStorage.clear();
    let low = 0, high = 16 * 1024 * 1024;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      try { localStorage.setItem('q', 'x'.repeat(mid)); low = mid; } catch { high = mid - 1; }
    }
    localStorage.clear();
    return low + 1;
  });
  // Leave room for the new test while it is answered, but not for the finished attempt, which also records each answer in its results.
  const answered = makeSession(mock);
  answered.questions.forEach((q, i) => {answered.answers[q.id] = proof(`New answer ${i}`);});
  const sessionSize = JSON.stringify(answered).length, finishedSize = JSON.stringify(finishSession(answered, Date.now(), () => null)).length;
  const target = capacity - KEY.length - Math.round((sessionSize + finishedSize) / 2);
  const history = [];
  for (let i = 0; ; i++) {
    const old = makeSession(generateMock({exam:'RMO', count:6, seed:`storage-full-old-${i}`}), Date.UTC(2026, 0, 1) + i * 86400000);
    old.questions.forEach(q => {old.answers[q.id] = proof(`Old answer ${i}`);});
    const attempt = finishSession(old, old.startedAt + 3600000, () => null);
    if (JSON.stringify(workspace([attempt, ...history])).length > target) break;
    history.unshift(attempt);
  }
  const seeded = workspace(history);
  seeded.proofDraft = 'p'.repeat(target - JSON.stringify(seeded).length);
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [KEY, JSON.stringify(seeded)]);
  await page.reload();
  await page.locator('.local-status').waitFor();
  const stored = () => page.evaluate(key => localStorage.getItem(key), KEY);
  assert.ok(Math.abs((await stored()).length - target) < 1000);
  assert.match(await page.locator('.local-status').textContent(), /Saved on this device/);

  await page.goto(origin + '/#generator');
  await page.locator('#gen-exam').selectOption('RMO');
  await page.locator('#assemble').click();
  await page.locator('#start-generated-mock').click();
  const {attemptId} = JSON.parse(await stored()).session;
  const answers = {};
  for (const [i, q] of mock.questions.entries()) {
    answers[q.id] = proof(`New answer ${i}`);
    await page.locator('#session-answer').fill(answers[q.id]);
    assert.equal(await page.locator('#answer-saved').textContent(), 'Answer saved on this device.');
    if (i < mock.questions.length - 1) await page.locator('#next').click();
  }
  await page.locator('#submit-session').click();
  await page.locator('#confirm-finish').click();
  await page.locator('.result-number').waitFor();

  const saved = JSON.parse(await stored());
  assert.ok(saved.session === null, `The finished attempt was not saved; the test submitted at ${saved.session?.submittedAt} remains pending in storage.`);
  assert.equal(saved.history[0].attemptId, attemptId);
  assert.deepEqual(saved.history[0].answers, answers);
  // Only the oldest attempts made room; the rest keep their order.
  assert.ok(saved.history.length <= history.length);
  assert.deepEqual(saved.history.slice(1).map(a => a.attemptId), history.slice(0, saved.history.length - 1).map(a => a.attemptId));
  assert.match(await page.locator('.local-status').textContent(), /Saved on this device/);
  const removed = history.length + 1 - saved.history.length;
  await page.waitForFunction(() => /storage is full/.test(document.querySelector('#toast').textContent), null, {timeout:5000});
  assert.match(await page.locator('#toast').textContent(), removed === 1 ? /the oldest completed session was removed/ : new RegExp(`the ${removed} oldest completed sessions were removed`));

  // Reloading shows the saved report without submitting the test again.
  const before = await stored();
  await page.reload();
  await page.locator('.result-number').waitFor();
  assert.equal(await page.getByRole('heading', {name:'Checking your attempt…'}).count(), 0);
  assert.equal(await stored(), before);
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`With browser storage full, the finished attempt was saved after removing ${removed} oldest of ${history.length} sessions.`);
} finally {
  await browser.close();
  server.close();
}
