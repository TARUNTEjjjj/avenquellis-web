import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {optionalResource, loadWorkspaceResources, bufferEvents} from '../dist/lib/startup.js';

test('optional startup resources preserve successful results and isolate failures', async () => {
  const engine = {name:'loaded engine'};
  const results = await Promise.all([
    optionalResource(() => engine),
    optionalResource(() => {throw Error('Network unavailable');}),
    optionalResource(() => Promise.reject(Error('Invalid WASM'))),
  ]);
  assert.deepEqual(results, [engine, null, null]);
});

test('stalled optional downloads share one deadline and cannot block startup indefinitely', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const pending = Promise.all(Array.from({length:3}, () => optionalResource(() => new Promise(() => {}))));
  await Promise.resolve();
  t.mock.timers.tick(8000);
  assert.deepEqual(await pending, [null, null, null]);
});

test('late rejection after a startup deadline is handled without changing the fallback', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  let rejectLoad;
  const pending = optionalResource(() => new Promise((resolve, reject) => {rejectLoad = reject;}));
  await Promise.resolve();
  t.mock.timers.tick(8000);
  assert.equal(await pending, null);
  rejectLoad(Error('Download failed after timeout'));
  await Promise.resolve();
});

test('real startup orchestration settles stalled catalog and engine downloads together', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const started = [];
  const resources = loadWorkspaceResources({
    loadMath: () => {started.push('math'); return new Promise(() => {});},
    loadGrader: () => {started.push('grader'); return new Promise(() => {});},
    fetchImpl: (url, options) => {
      assert.equal(url, './archive.json');
      assert.ok(options.signal instanceof AbortSignal);
      started.push('catalog');
      return new Promise(() => {});
    },
  });
  await Promise.resolve();
  assert.deepEqual(started, ['math', 'grader', 'catalog']);
  t.mock.timers.tick(8000);
  assert.deepEqual(await resources, [null, null, null]);
});

test('a malformed or unavailable catalog cannot discard a healthy local checker', async () => {
  const grader = {assess() {}};
  for (const response of [Response.json({}, {status:503}), Response.json({papers:null}), new Response('invalid JSON')]) {
    assert.deepEqual(await loadWorkspaceResources({loadMath:() => null, loadGrader:() => grader,
      fetchImpl:async () => response}), [null, grader, null]);
  }
  const catalog = {papers:[], questionReferences:[], sources:[]};
  assert.deepEqual(await loadWorkspaceResources({loadMath:() => null, loadGrader:() => grader,
    fetchImpl:async () => Response.json(catalog)}), [null, grader, catalog]);
});

const offlineTypes = ['avenquellis:offline-ready', 'avenquellis:offline-update-ready'];

test('offline notices raised while the workspace starts are kept and delivered once, in order', () => {
  const target = new EventTarget();
  const notices = bufferEvents(target, offlineTypes);
  target.dispatchEvent(new CustomEvent('avenquellis:offline-update-ready', {detail:{message:'Update saved'}}));
  target.dispatchEvent(new Event('avenquellis:offline-ready'));
  target.dispatchEvent(new Event('avenquellis:offline-unavailable'));
  const seen = [];
  notices.deliver(event => seen.push([event.type, event.detail?.message]));
  assert.deepEqual(seen, [['avenquellis:offline-update-ready', 'Update saved'], ['avenquellis:offline-ready', undefined]]);
  target.dispatchEvent(new Event('avenquellis:offline-ready'));
  assert.deepEqual(seen.map(([type]) => type), [...offlineTypes.slice().reverse(), 'avenquellis:offline-ready']);
});

// register-offline.js runs on window load, which does not wait for app.js's top-level await.
test('app.js starts holding offline notices before it awaits startup resources', async () => {
  const source = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
  const holding = source.indexOf('bufferEvents(window'), waiting = source.indexOf('await loadWorkspaceResources(');
  assert.ok(holding >= 0 && waiting > holding);
  assert.ok(!/addEventListener\(\s*["']avenquellis:offline/.test(source), 'Offline notices must go through the startup buffer.');
});
