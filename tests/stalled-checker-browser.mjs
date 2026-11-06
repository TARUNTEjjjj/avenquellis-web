/** Optional regression check: a stalled proof-checker download must not leave proof buttons waiting forever. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createStaticServer} from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');
const server = createStaticServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE});

// Startup gives up on the checker after eight seconds and shows the workspace; the download never finishes.
async function openWithStalledChecker(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/lib/native-grade/*.wasm', () => {});
  await page.route('**/api/grade-status', route => route.fulfill({json:{available:false}}));
  await page.goto(origin + '/#proof');
  await page.locator('[data-certificate-example]').first().waitFor({timeout:20000});
  return {page, errors};
}
async function settles(read, seconds) {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    const value = await read();
    if (value || Date.now() > deadline) return value;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

async function checkCertificate() {
  const context = await browser.newContext({serviceWorkers:'block'});
  const {page, errors} = await openWithStalledChecker(context);
  let hosted = 0;
  await page.route('**/api/assess', route => {
    hosted++;
    return route.fulfill({json:{questionId:route.request().postDataJSON().questionId, status:'incomplete_certificate',
      complete:false, score:null, lowerBoundPoints:4, maxMarks:10, criteria:[], feedback:[]}});
  });
  await page.locator('[data-certificate-example]').first().click();
  await page.locator('[data-insert-certificate]').click();
  const check = page.getByRole('button', {name:'Check certificate'});
  await check.click();
  const shown = await settles(async () => (await page.locator('[data-certificate-result]').textContent()).trim(), 10);
  assert.match(shown, /4 \/ 10 marks verified so far/, 'Check certificate is still waiting for the stalled checker download.');
  assert.equal(hosted, 1);
  assert.equal(await check.isDisabled(), false);
  assert.deepEqual(errors, []);
  await context.close();
  console.log('Check certificate used the hosted checker while the browser checker download was stalled.');
}

// The on-device review validates its readings with the same checker after the model has run.
async function deviceReview() {
  const context = await browser.newContext({serviceWorkers:'block'});
  await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'gpu', {get: () => ({})}));
  await context.route('**/device-runtime/device.js', route => route.fulfill({contentType:'text/javascript', body:
    'export async function gradeOnDevice(){return {reviews:[{reviewer:1,status:"failed"},{reviewer:2,status:"failed"}],provenance:{}};}\n' +
    'export async function releaseDeviceModel(){}\n'}));
  const {page, errors} = await openWithStalledChecker(context);
  await page.locator('#proof-answer').fill('Every common divisor of a and b divides a - b, so the greatest common divisors agree.');
  const device = page.locator('[data-device-grade]');
  await device.click();
  const status = await settles(async () => {
    const text = (await page.locator('[data-model-status]').textContent()).trim();
    return /could not load/.test(text) && text;
  }, 15);
  assert.ok(status, 'The on-device review is still waiting for the stalled checker download.');
  assert.equal(await device.isDisabled(), false);
  assert.equal(await page.locator('#proof-answer').inputValue(), 'Every common divisor of a and b divides a - b, so the greatest common divisors agree.');
  assert.deepEqual(errors, []);
  await context.close();
  console.log('The on-device review stopped waiting for the stalled checker and kept the draft.');
}

const failures = [];
try {
  for (const scenario of [checkCertificate, deviceReview]) {
    try { await scenario(); } catch (error) { failures.push(error); console.error(`${scenario.name}: ${error.message}`); }
  }
} finally {
  await browser.close();
  server.close();
}
if (failures.length) throw failures[0];
