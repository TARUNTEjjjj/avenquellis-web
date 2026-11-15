// dist/app.js under the stub DOM (tests/support/stub-dom.mjs) when browser storage is full. Every save goes through
// the workspace store, which hands a full storage to saveWorkspace (dist/lib/workspace-storage.js): the oldest
// completed sessions make room so that current work still saves, and the page says how many. A restore checks
// that its save succeeded. The tests share one app and run in order.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {createDom, createStorage} from './support/stub-dom.mjs';
import {makeSession, finishSession} from '../dist/lib/session.js';
import {questionBank} from '../dist/lib/questions.js';

const KEY = 'avenquellis.workspace.v1';
const numeric = questionBank.filter(q => q.type === 'numeric').slice(0, 2);
// Twenty completed tests, newest first, and a test in progress.
const history = Array.from({length: 20}, (_, i) => {
  const s = makeSession({id: 'mock-' + i, title: 'Mock ' + i, durationMinutes: 60, questions: numeric, maxMarks: null}, 1_700_000_000_000 + i * 1000);
  s.attemptId = 'attempt-' + i;
  for (const q of numeric) s.answers[q.id] = String(q.answer);
  return finishSession(s, s.startedAt + 60000);
}).reverse();
const active = makeSession({id: 'next', title: 'Next test', durationMinutes: 180, questions: numeric, maxMarks: null});
const storage = createStorage({initial: {[KEY]: JSON.stringify({history, reviews: [], session: active, bookmarks: []})}});
const dom = createDom({dist: fileURLToPath(new URL('../dist/', import.meta.url)), hash: '#progress', storage});
await import(dom.appUrl);
await sleep(50);

const stored = () => JSON.parse(storage.getItem(KEY));
const toast = () => dom.$('#toast').textContent;
const goto = async page => { dom.loc.hash = page; await sleep(10); };
const used = () => [...storage.data].reduce((n, [k, v]) => n + k.length + v.length, 0);
// Leaving or hiding the page saves at once whatever typing was waiting for its pause.
const saveNow = () => dom.win.dispatchEvent(new Event('pagehide'));
const ids = list => list.map(a => a.attemptId);
const madeRoom = n => `Browser storage is full, so ${n === 1 ? 'the oldest completed session was' : `the ${n} oldest completed sessions were`} removed from this device to make room.`;
async function restore(data) {
  await goto('progress');
  const input = dom.$('#import-backup');
  input.files = [new File([JSON.stringify(data)], 'backup.json', {type: 'application/json'})];
  input.dispatchEvent(new Event('change'));
  await sleep(10);
  dom.$('#confirm-import').click();
}
const typed = 'Working typed while browser storage is full. '.repeat(20);
let backup = null;

test('when browser storage is full, the oldest completed sessions make room for new work, and the page says how many', async () => {
  dom.$('#export-backup').click();
  backup = JSON.parse(await dom.blobs.at(-1).text());
  assert.equal(backup.history.length, 20);
  await goto('session');
  saveNow();
  storage.quota = used() + 300;
  const field = dom.$('#session-answer');
  field.value = typed;
  field.dispatchEvent(new Event('input'));
  assert.equal(dom.$('#answer-saved').textContent, 'Saving…');
  saveNow();
  const kept = stored().history.length;
  assert.ok(kept > 0 && kept < 20, 'the oldest sessions made room: ' + kept);
  assert.deepEqual(ids(stored().history), ids(history.slice(0, kept)), 'the newest stay, in order');
  assert.equal(stored().session.answers[numeric[0].id], typed, 'the new work is saved');
  assert.equal(dom.$('#answer-saved').textContent, 'Answer saved on this device.');
  assert.match(dom.$('.local-status').innerHTML, /Saved on this device/);
  // The notice follows any message from the action that saved.
  await sleep(10);
  assert.equal(toast(), madeRoom(20 - kept));
  // This tab shows what storage holds.
  await goto('progress');
  assert.ok(dom.main.innerHTML.includes(`<strong>${kept}</strong><small>Completed sessions`));
});

test('a save that even the newest session cannot make room for fails and changes nothing stored; the page says so', async () => {
  await goto('session');
  saveNow();
  const before = storage.getItem(KEY);
  // Nothing more fits.
  storage.quota = 0;
  const field = dom.$('#session-answer');
  field.value = typed + 'Checked.';
  field.dispatchEvent(new Event('input'));
  saveNow();
  assert.equal(storage.getItem(KEY), before, 'storage holds exactly what it held');
  assert.equal(dom.$('#answer-saved').textContent, 'Storage unavailable. Keep this tab open.');
  assert.match(dom.$('.local-status').innerHTML, /Storage unavailable · export your work/);
  assert.equal(dom.win.appUpdateCanReload(), false, 'an update must not reload work this tab could not save');
  // Once there is room, the next save stores the work this tab kept.
  storage.quota = Infinity;
  field.dispatchEvent(new Event('input'));
  saveNow();
  assert.equal(stored().session.answers[numeric[0].id], typed + 'Checked.');
  assert.match(dom.$('.local-status').innerHTML, /Saved on this device/);
});

test('a whole backup that fits only without its oldest sessions is restored without them, and they stay in the file', async () => {
  await goto('progress');
  saveNow();
  // Room for this device's workspace as it is, which holds fewer sessions than the backup, and for its list of
  // practice reviews.
  storage.quota = used() + 100;
  await restore(backup);
  const kept = stored().history.length, n = 20 - kept;
  assert.ok(kept > 0 && kept < 20);
  assert.deepEqual(ids(stored().history), ids(backup.history.slice(0, kept)));
  const message = `Backup restored, but browser storage is full, so its ${n} oldest session${n === 1 ? ' was' : 's were'} not saved on this device. ${n === 1 ? 'It remains' : 'They remain'} in the backup file.`;
  assert.equal(toast(), message);
  // It says so in place of the notice about sessions removed from this device.
  await sleep(10);
  assert.equal(toast(), message);
  storage.quota = Infinity;
});

test("an active draft restored into a full storage makes room as any save does: this device's oldest sessions give way, and the page says so", async () => {
  await goto('progress');
  saveNow();
  const before = stored().history;
  storage.quota = used() + 50;
  const draft = {...active, attemptId: 'restored-draft', answers: {[numeric[0].id]: 'A long working. '.repeat(200)}};
  await restore(draft);
  assert.equal(toast(), 'Backup restored. Numeric results recalculated.');
  const kept = stored().history.length;
  assert.ok(kept > 0 && kept < before.length, 'the oldest sessions made room: ' + kept);
  assert.deepEqual(ids(stored().history), ids(before.slice(0, kept)));
  assert.equal(stored().session.attemptId, 'restored-draft');
  await sleep(10);
  assert.equal(toast(), madeRoom(before.length - kept));
  storage.quota = Infinity;
});
