import test from 'node:test';
import assert from 'node:assert/strict';
import {optionalResource, loadWorkspaceResources} from '../dist/lib/startup.js';

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
