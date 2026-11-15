// dist/app.js under the stub DOM (tests/support/stub-dom.mjs), opened in a browser that blocks this site's storage:
// reading localStorage throws, as it does when site data is blocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createDom, createStorage} from './support/stub-dom.mjs';

const storage = createStorage();
storage.blocked = true;
const dom = createDom({dist: fileURLToPath(new URL('../dist/', import.meta.url)), hash: '#proof', storage});
// What index.html says before the app has saved anything.
dom.$('.local-status').innerHTML = '<i></i> Saved on this device';
await import(dom.appUrl);

test('a browser that blocks storage is told so as soon as the app opens, not once typing would have paused', () => {
  assert.equal(dom.$('.local-status').innerHTML, '<i></i> Storage unavailable · export your work');
  assert.match(dom.$('#proof-save').textContent, /^Storage unavailable · /);
});
