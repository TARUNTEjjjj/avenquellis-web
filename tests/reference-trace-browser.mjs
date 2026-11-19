/** Browser check, run in CI, for versioned saved references and the capped arithmetic trace. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createStaticServer} from '../scripts/serve.mjs';
import {onRequest as assess} from '../functions/api/assess.js';
import {generateMock} from '../dist/lib/questions.js';
import {initExactMath, evaluateExact} from '../dist/math/exact-math.js';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');
const server = createStaticServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE});
const storageKey = 'avenquellis.workspace.v1';
const mock = generateMock({exam:'RMO', count:6, seed:'saved-reference'});

// A saved test, reloaded and then submitted, sends its question's content version to the actual
// Pages checker route. tamper(state) may change the saved workspace before the reload.
async function submitSavedTest(tamper) {
  const context = await browser.newContext({serviceWorkers:'block'});
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  // The hosted checker is the one that resolves references; the local checker grades the saved question itself.
  await page.route('**/lib/native-grade/*.wasm', route => route.abort());
  await page.route('**/api/generate', route => route.fulfill({json:{engine:'cpp-wasm', result:mock}}));
  await page.route('**/api/grade-status', route => route.fulfill({json:{available:false}}));
  await page.route('**/api/assess', async route => {
    const request = route.request();
    const response = await assess({request:new Request(origin + '/api/assess', {
      method:'POST', headers:{'Content-Type':'application/json', Origin:origin}, body:request.postData()
    }), env:{}});
    const body = await response.text();
    requests.push({sent:request.postDataJSON(), status:response.status, body:JSON.parse(body)});
    await route.fulfill({status:response.status, contentType:'application/json', body});
  });
  await page.goto(origin + '/#generator');
  await page.locator('#gen-exam').selectOption('RMO');
  await page.locator('#assemble').click();
  await page.locator('#start-generated-mock').click();
  await page.locator('#session-answer').fill('Every common divisor of the two numbers divides their difference.');
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.session?.answers &&
    Object.values(JSON.parse(localStorage.getItem(key)).session.answers).some(Boolean), storageKey);
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  const question = saved.session.questions[0];
  assert.equal(question.generator.version, '0.1.0', 'The saved question keeps its content version.');
  if (tamper) await page.evaluate(([key, state]) => localStorage.setItem(key, JSON.stringify(state)), [storageKey, tamper(saved)]);
  await page.reload();
  await page.locator('a[data-page="overview"]').click();
  await page.locator('[data-go="session"]').click();
  await page.locator('#submit-session').click();
  await page.locator('#confirm-finish').click();
  await page.locator('.result-number').waitFor();
  const state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  assert.equal(state.session, null);
  assert.equal(state.history.length, 1);
  const first = requests.find(r => r.sent.questionId === question.id);
  assert.ok(first, 'The first proof was sent to the hosted checker.');
  assert.deepEqual(errors, []);
  await context.close();
  return {question, first, result:state.history[0].results.find(r => r.questionId === question.id) ?? state.history[0].results[0]};
}

async function arithmeticTrace() {
  await initExactMath();
  const expression = Array(512).fill('1').join('+');
  const expected = evaluateExact(expression);
  assert.ok(expected.omittedSteps > 0);
  const context = await browser.newContext({serviceWorkers:'block'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/grade-status', route => route.fulfill({json:{available:false}}));
  await page.goto(origin + '/#arithmetic');
  await page.getByText('C++ / WEBASSEMBLY · READY').waitFor({timeout:20000});
  await page.locator('#math-expression').fill(expression);
  await page.locator('#math-evaluate button[type=submit]').click();
  await page.locator('#math-result .exact-result strong').waitFor();
  assert.equal(await page.locator('#math-result .exact-result strong').textContent(), '512');
  assert.equal(await page.locator('#math-result .calculation-steps li').count(), expected.steps.length);
  const note = await page.locator('#math-result .trace-omitted').textContent();
  assert.match(note, new RegExp(`${expected.omittedSteps.toLocaleString('en-US')} later steps are not listed`));
  // A short expression shows its whole trace with no note.
  await page.locator('[data-expression="(1/3 + 1/6) * 4"]').click();
  await page.waitForFunction(() => document.querySelector('#math-result .exact-result strong')?.textContent === '2');
  assert.equal(await page.locator('#math-result .trace-omitted').count(), 0);
  assert.ok(await page.locator('#math-result .calculation-steps li').count() > 0);
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`The arithmetic lab listed ${expected.steps.length} trace steps, said ${expected.omittedSteps} were left out and showed the complete value.`);
}

try {
  const current = await submitSavedTest();
  assert.equal(current.first.sent.reference.version, '0.1.0');
  assert.equal(current.first.sent.reference.seed, current.question.generator.seed);
  assert.equal(current.first.status, 200, 'The Pages checker resolved the versioned saved reference.');
  assert.equal(current.first.body.questionId, current.question.id);
  console.log('A reloaded saved test sent its content version, and the Pages checker resolved it.');

  // Every earlier release saved generator.version 0.1.0 with its questions, so their saved tests send the
  // reference above. References without any version, from app copies before this release, are covered by
  // tests/question-reference.test.js against the same Pages route.

  // A saved question whose family version the catalog no longer has is refused, and stays for review rather than scoring zero.
  const mismatched = await submitSavedTest(state => {
    for (const q of state.session.questions) q.generator.version = '0.2.0';
    return state;
  });
  assert.equal(mismatched.first.sent.reference.version, '0.2.0');
  assert.equal(mismatched.first.status, 404);
  assert.equal(mismatched.result.status, 'needs_review');
  assert.notEqual(mismatched.result.score, 0);
  console.log('A saved reference to another content version was refused, and its proof stayed pending review.');

  await arithmeticTrace();
} finally {
  await browser.close();
  server.close();
}
