/** Optional real-browser check: cancel a generation, retry, and leave a pending request. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createStaticServer} from '../scripts/serve.mjs';
import {generateQuestion} from '../dist/lib/questions.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const server=createStaticServer();
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
try {
  const page=await browser.newPage({serviceWorkers:'block'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  let calls=0,release;
  await page.route('**/api/generate',async route=>{
    calls++;
    if(calls===1||calls===3)await new Promise(resolve=>{release=resolve;});
    await route.fulfill({json:{engine:'cpp-wasm',result:generateQuestion({seed:'cancel-retry',topic:'algebra'})}}).catch(()=>{});
  });
  await page.goto(origin+'/#generator');
  const request=page.waitForRequest('**/api/generate');
  await page.locator('#generate-form [type=submit]').click();await request;
  assert.equal(await page.locator('#assemble').isDisabled(),true);
  await page.locator('#cancel-generation').click();
  await page.getByText('Generation cancelled. Change the settings and try again.').waitFor();
  assert.equal(await page.locator('#assemble').isDisabled(),false);
  assert.equal(await page.locator('#cancel-generation').isVisible(),false);
  release();
  await page.locator('#generate-form [type=submit]').click();
  await page.locator('#try-generated').waitFor();
  assert.equal(calls,2);
  const third=page.waitForRequest('**/api/generate');
  await page.locator('#generate-form [type=submit]').click();await third;
  const aborted=page.waitForEvent('requestfailed',{predicate:request=>request.url().endsWith('/api/generate')});
  await page.locator('a[data-page="overview"]').click();
  await aborted;release();
  assert.deepEqual(errors,[]);
  console.log('Generation cancellation, control recovery, retry, and navigation abort passed in Chrome.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
