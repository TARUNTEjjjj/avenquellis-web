/** Optional regression check: choosing the same backup file again must reopen the restore dialog. */
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStaticServer} from '../scripts/serve.mjs';
import {generateMock} from '../dist/lib/questions.js';
import {makeSession} from '../dist/lib/session.js';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');
const server = createStaticServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE});
const folder = await mkdtemp(join(tmpdir(), 'avenquellis-backup-'));
try {
  const context = await browser.newContext({serviceWorkers:'block'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/#progress');
  // Use Chrome's own file chooser with files on disk, as a person does. It reports an unchanged selection as cancel, not change.
  const choose = async path => {
    await page.evaluate(() => {document.querySelector('#toast').textContent = '';});
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#import-backup').click()]);
    await chooser.setFiles(path);
    await page.waitForFunction(() => document.querySelector('#modal').open || document.querySelector('#toast').textContent, null, {timeout:3000})
      .catch(() => {});
    return page.evaluate(() => ({dialog:document.querySelector('#modal').open ? document.querySelector('#modal-heading').textContent : null,
      toast:document.querySelector('#toast').textContent}));
  };
  const draft = JSON.stringify(makeSession(generateMock({exam:'RMO', count:6, seed:'backup-import'})));
  const backup = join(folder, 'avenquellis-active-draft.json');
  await writeFile(backup, draft);
  assert.equal((await choose(backup)).dialog, 'Restore this active draft?');
  await page.locator('#cancel-import').click();
  assert.equal((await choose(backup)).dialog, 'Restore this active draft?', 'Choosing the same file after Cancel did nothing.');
  await page.keyboard.press('Escape');
  assert.equal((await choose(backup)).dialog, 'Restore this active draft?', 'Choosing the same file after Escape did nothing.');
  await page.locator('#cancel-import').click();

  const damaged = join(folder, 'avenquellis-backup.json');
  await writeFile(damaged, '{"schema":"avenquellis-backup-v1","history":"not a list"}');
  const rejected = await choose(damaged);
  assert.equal(rejected.dialog, null);
  assert.match(rejected.toast, /^Invalid backup/);
  await writeFile(damaged, draft);
  assert.equal((await choose(damaged)).dialog, 'Restore this active draft?', 'Choosing the corrected file at the same path did nothing.');
  await page.locator('#confirm-import').click();
  assert.match(await page.locator('#toast').textContent(), /^Backup restored/);
  assert.deepEqual(errors, []);
  await context.close();
  console.log('The same backup file can be chosen again after Cancel and after a rejected file is corrected.');
} finally {
  await browser.close();
  server.close();
  await rm(folder, {recursive:true, force:true});
}
