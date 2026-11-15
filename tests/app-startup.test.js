// dist/app.js under the stub DOM (tests/support/stub-dom.mjs), started on saved work it cannot read, with offline
// notices raised while it starts and no connection to the question generator. The tests share that one app and run
// in order.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {createDom, createStorage} from './support/stub-dom.mjs';
import {makeSession, finishSession} from '../dist/lib/session.js';
import {questionBank, generateQuestion} from '../dist/lib/questions.js';

const KEY = 'avenquellis.workspace.v1', damaged = '{"history":[{"broken"';
const offline = 'Generating new questions needs an internet connection. The problem collection works offline.';
const update = 'An update is saved. It opens when all app windows are ready; active work stays open.';
const storage = createStorage({initial: {[KEY]: damaged}});
// The question generator cannot be reached, stalls until the request is cancelled, or answers.
let generator = 'offline', signal = null;
const dom = createDom({dist: fileURLToPath(new URL('../dist/', import.meta.url)), hash: '#progress', storage, fetchImpl: async (input, init, files) => {
  if (!String(input?.url ?? input).includes('/api/generate')) return files(input, init);
  const request = (signal = init.signal);
  if (generator === 'offline') throw new TypeError('Failed to fetch');
  if (generator === 'stall') return new Promise((_, reject) => request.addEventListener('abort', () => reject(request.reason), {once: true}));
  return Response.json({engine: 'cpp-wasm', result: generateQuestion({seed: 'startup', topic: 'algebra'})});
}});
// Every toast, in order: each replaces the one shown before.
const toasts = [];
{
  let text = '';
  Object.defineProperty(dom.$('#toast'), 'textContent', {configurable: true, get: () => text, set: value => { toasts.push((text = String(value))); }});
}
// register-offline.js reports on window load, which can come while the workspace is still starting: here, as soon as
// app.js has begun to wait for its engines and catalog.
let guard = null;
Object.defineProperty(dom.win, 'appUpdateCanReload', {configurable: true, get: () => guard, set: fn => {
  if (!guard)
    queueMicrotask(() => {
      dom.win.dispatchEvent(new CustomEvent('avenquellis:offline-update-ready', {detail: {message: update}}));
      dom.win.dispatchEvent(new CustomEvent('avenquellis:offline-ready', {detail: {}}));
    });
  guard = fn;
}});
await import(dom.appUrl);
await sleep(50);

const stored = () => JSON.parse(storage.getItem(KEY));
const saveNow = () => dom.win.dispatchEvent(new Event('pagehide'));
async function goto(page) {
  if (dom.loc.hash === '#' + page) dom.win.dispatchEvent(new Event('hashchange'));
  else dom.loc.hash = page;
  await sleep(10);
}

test('saved work that cannot be read is kept aside and offered for download; notices raised while the app started still show', async () => {
  assert.deepEqual(toasts.slice(0, 2), [update, 'Saved work on this device could not be read. It was kept unchanged: see Your progress.']);
  assert.equal(dom.$('#toast').textContent, toasts[1], 'the warning about saved work stays shown');
  assert.equal(dom.$('#offline-status').textContent, 'Ready offline · new questions and source PDFs need internet');
  const copies = [...storage.data.keys()].filter(key => key.startsWith(KEY + '.unreadable.'));
  assert.equal(copies.length, 1);
  assert.equal(storage.getItem(copies[0]), damaged);
  assert.match(dom.main.innerHTML, /Some saved data could not be read/);
  dom.$(`[data-unreadable-download="${copies[0]}"]`).click();
  assert.equal(await dom.blobs.at(-1).text(), damaged);
  // New work is saved beside the copy, which stays until the learner deletes it.
  saveNow();
  assert.deepEqual(stored().history, []);
  assert.equal(storage.getItem(copies[0]), damaged);
});

test('offline, the forge and the test arena say that new questions need internet; Cancel and leaving the page stop a pending generation', async () => {
  await goto('generator');
  const form = dom.$('#generate-form'), output = dom.$('#forge-output'), cancel = dom.$('#cancel-generation');
  const submit = async () => {
    form.dispatchEvent(Object.assign(new Event('submit'), {preventDefault() {}}));
    await sleep(10);
  };
  await submit();
  assert.equal(output.textContent, offline);
  assert.equal(cancel.hidden, true);
  assert.equal(dom.$('#assemble').disabled, false);
  generator = 'stall';
  await submit();
  assert.equal(cancel.hidden, false);
  assert.equal(dom.$('#assemble').disabled, true);
  cancel.click();
  await sleep(10);
  assert.equal(signal.aborted, true);
  assert.equal(output.textContent, 'Generation cancelled. Change the settings and try again.');
  assert.equal(dom.$('#assemble').disabled, false);
  generator = 'ok';
  await submit();
  assert.match(output.innerHTML, /id="try-generated"/);
  generator = 'stall';
  await submit();
  const pending = signal;
  assert.equal(pending.aborted, false);
  await goto('overview');
  assert.equal(pending.aborted, true, 'leaving the page cancels the pending generation');
  generator = 'offline';
  await goto('tests');
  dom.$$('[data-mock]')[0].click();
  await sleep(10);
  assert.equal(dom.$('#toast').textContent, offline);
});

test('a page drawn after another window saved shows that work, though no event said so', async () => {
  await goto('progress');
  saveNow();
  assert.match(dom.main.innerHTML, /<strong>0<\/strong><small>Completed sessions/);
  const s = makeSession({id: 'elsewhere', title: 'Finished elsewhere', durationMinutes: 20,
    questions: questionBank.filter(q => q.type === 'numeric').slice(0, 2), maxMarks: 20});
  storage.setItem(KEY, JSON.stringify({...stored(), history: [finishSession(s, s.startedAt + 60000)]}));
  // Choosing the page again draws it from what is saved now, not from this window's older copy.
  dom.win.dispatchEvent(new Event('hashchange'));
  assert.match(dom.main.innerHTML, /<strong>1<\/strong><small>Completed sessions/);
  assert.match(dom.main.innerHTML, /Finished elsewhere/);
});
