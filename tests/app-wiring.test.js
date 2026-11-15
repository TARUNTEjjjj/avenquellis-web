// dist/app.js itself, run once under a stub DOM (tests/support/stub-dom.mjs): how it saves typing, takes in
// another window's work, and restores backups. The tests share that one app and run in order.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {createDom, createStorage} from './support/stub-dom.mjs';
import {makeSession, finishSession} from '../dist/lib/session.js';
import {createWorkspaceStore} from '../dist/lib/workspace-store.js';
import {questionBank} from '../dist/lib/questions.js';

const KEY = 'avenquellis.workspace.v1', REVIEWS = 'avenquellis.prose-reviews.v1';
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAEAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKVAB//Z', 'base64');
// An active test of two proofs, open in this window and, below, in another one.
const proofs = questionBank.filter(q => q.type === 'proof').slice(0, 2);
const [q1, q2] = proofs;
const active = makeSession({id: 'two-windows', title: 'Two windows', durationMinutes: 60, questions: proofs, maxMarks: null});
const storage = createStorage({initial: {[KEY]: JSON.stringify({history: [], reviews: [], session: active, bookmarks: []})}});
// The compiled proof checker does not load here, so a submitted proof waits for the hosted checker, which
// answers when the test says so: the proof needs review. (A request that fails is asked again, as a reload or a
// dropped connection can cause that failure: see dist/lib/interrupted-check.js.) A question generation waits
// until it is cancelled.
const checks = [], generations = [];
const dom = createDom({dist: fileURLToPath(new URL('../dist/', import.meta.url)), hash: '#session', storage, fetchImpl: (input, init, files) => {
  const url = String(input?.url ?? input);
  if (url.includes('avenquellis-grader-runtime.wasm')) return Promise.reject(new TypeError('Failed to fetch'));
  if (url.includes('/api/assess'))
    return new Promise(resolve => checks.push(() =>
      resolve(Response.json({questionId: JSON.parse(init.body).questionId, status: 'needs_review', score: null}))));
  if (url.includes('/api/generate'))
    return new Promise((_, reject) => { generations.push(init.signal); init.signal.addEventListener('abort', () => reject(init.signal.reason), {once: true}); });
  return files(input, init);
}});
// A chosen photo is still being decoded, as a large one would be.
globalThis.createImageBitmap = () => new Promise(() => {});
await import(dom.appUrl);
await sleep(50);

const stored = () => JSON.parse(storage.getItem(KEY));
const toast = () => dom.$('#toast').textContent;
// Redraw the open page, as choosing it in the menu again does.
const redraw = () => dom.win.dispatchEvent(new Event('hashchange'));
const goto = async page => { dom.loc.hash = page; await sleep(10); };
// Leaving or hiding the page saves at once whatever typing was waiting for its pause.
const saveNow = () => dom.win.dispatchEvent(new Event('pagehide'));
// Another window of the app saves the shared workspace; this one gets a storage event.
function otherWindowSaves(change) {
  const workspace = stored();
  change(workspace);
  storage.setItem(KEY, JSON.stringify(workspace));
  dom.win.dispatchEvent(Object.assign(new Event('storage'), {key: KEY}));
}
async function choose(input, file) {
  input.files = [file];
  input.value = 'C:\\fakepath\\' + file.name;
  input.dispatchEvent(new Event('change'));
  await sleep(10);
}
const backupFile = data => new File([JSON.stringify(data)], 'backup.json', {type: 'application/json'});
let draft = null;

test('typing says "Saving…" until its save has run, and hiding the page saves it at once', () => {
  saveNow();
  const field = dom.$('#session-answer');
  assert.ok(field, 'the saved test is open');
  field.value = 'Let n be even.';
  field.dispatchEvent(new Event('input'));
  assert.equal(dom.$('#answer-saved').textContent, 'Saving…');
  assert.equal(stored().session.answers[q1.id], undefined, 'typing is saved once it pauses');
  // A page drawn while that save waits does not claim it either.
  redraw();
  assert.match(dom.main.innerHTML, /id="answer-saved">Saving…</);
  saveNow();
  assert.equal(stored().session.answers[q1.id], 'Let n be even.');
  assert.equal(dom.$('#answer-saved').textContent, 'Answer saved on this device.');
});

test("another window's save redraws the open page only when what it shows changed, and waits while a handwritten page is in use", async () => {
  let field = dom.$('#session-answer');
  otherWindowSaves(w => { w.bookmarks = ['saved-elsewhere']; });
  assert.equal(dom.$('#session-answer'), field, 'a change this page does not show leaves it alone');
  otherWindowSaves(w => { w.session.answers[q2.id] = 'From the other window.'; });
  assert.notEqual(dom.$('#session-answer'), field, 'an answer to the other question is shown');
  assert.match(dom.main.innerHTML, /2 of 2 answered/);
  field = dom.$('#session-answer');
  assert.equal(field.value, 'Let n be even.', 'and the answer written here stays');
  // A photo of a handwritten page is being prepared: a redraw would discard it, so the other window's work waits.
  const photo = dom.$('[data-hw-file]');
  await choose(photo, new File([jpeg], 'page.jpg', {type: 'image/jpeg'}));
  assert.match(dom.$('[data-hw-status]').textContent, /Preparing/);
  otherWindowSaves(w => { w.session.answers[q2.id] = 'Revised in the other window.'; });
  dom.tick();
  assert.equal(dom.$('#session-answer'), field, 'not redrawn while the photo is in use');
  assert.equal(photo.isConnected, true);
  assert.match(dom.main.innerHTML, /2 of 2 answered/);
  // Once the photo is removed, the next tick of the timer shows the waiting work.
  dom.$('[data-hw-clear]').click();
  dom.tick();
  assert.notEqual(dom.$('#session-answer'), field);
  saveNow();
  assert.deepEqual(stored().session.answers, {[q1.id]: 'Let n be even.', [q2.id]: 'Revised in the other window.'});
  assert.deepEqual(stored().bookmarks, ['saved-elsewhere']);
});

test('hiding the page saves waiting typing; showing it again, or returning to it, takes in what other windows saved', () => {
  let field = dom.$('#session-answer');
  field.value = 'Let n be even. Then n = 2k.';
  field.dispatchEvent(new Event('input'));
  dom.doc.hidden = true;
  dom.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(stored().session.answers[q1.id], 'Let n be even. Then n = 2k.', 'hiding the page saves at once');
  otherWindowSaves(w => { w.session.flags[q2.id] = true; });
  assert.equal(dom.$('#session-answer'), field, 'a hidden page is not redrawn');
  dom.doc.hidden = false;
  dom.doc.dispatchEvent(new Event('visibilitychange'));
  assert.notEqual(dom.$('#session-answer'), field, 'shown again, it takes in the other window\'s work');
  assert.match(dom.main.innerHTML, /aria-label="Question 2, answered, flagged"/);
  // A page brought back from the back-forward cache missed the storage events of its time away.
  field = dom.$('#session-answer');
  const workspace = stored();
  workspace.session.flags[q2.id] = false;
  storage.setItem(KEY, JSON.stringify(workspace));
  dom.win.dispatchEvent(new Event('pageshow'));
  assert.notEqual(dom.$('#session-answer'), field);
  assert.match(dom.main.innerHTML, /aria-label="Question 2, answered"/);
  assert.equal(dom.$('#session-answer').value, 'Let n be even. Then n = 2k.');
});

test("another window's save leaves a pending question generation alone", async () => {
  await goto('generator');
  dom.$('#generate-form').dispatchEvent(Object.assign(new Event('submit'), {preventDefault() {}}));
  await sleep(10);
  const signal = generations.at(-1);
  assert.equal(signal?.aborted, false, 'a generation is pending');
  otherWindowSaves(w => { w.bookmarks = []; });
  dom.tick();
  assert.equal(signal.aborted, false);
  dom.$('#cancel-generation').click();
  assert.equal(signal.aborted, true);
});

test('a restore waits while a submitted test is being checked, then restores its draft as a new attempt', async () => {
  await goto('session');
  dom.$('#export-active').click();
  draft = JSON.parse(await dom.blobs.at(-1).text());
  dom.$('#submit-session').click();
  dom.$('#confirm-finish').click();
  await sleep(10);
  assert.equal(checks.length, 2, 'both proofs wait for the hosted checker');
  assert.ok(stored().session.submittedAt != null, 'the submitted test is saved');
  await goto('progress');
  const input = dom.$('#import-backup');
  await choose(input, backupFile(draft));
  assert.equal(input.value, '', 'the choice is cleared, so the same file can be chosen again');
  assert.equal(dom.modal.open, false);
  assert.equal(toast(), 'Your submitted test is still being checked. Restore the backup once its report is ready.');
  assert.equal(stored().history.length, 0);
  for (const answer of checks) answer();
  await sleep(10);
  assert.equal(stored().session, null);
  assert.equal(stored().history.length, 1, 'the submitted attempt reached the history');
  await goto('progress');
  await choose(dom.$('#import-backup'), backupFile(draft));
  assert.equal(dom.modal.open, true);
  dom.$('#confirm-import').click();
  assert.equal(toast(), 'Backup restored. Numeric results recalculated.');
  const after = stored();
  assert.equal(after.history.length, 1);
  assert.deepEqual(after.session.answers, draft.answers);
  assert.notEqual(after.session.attemptId, after.history[0].attemptId, 'the draft continues as a new attempt');
});

test('a backup that browser storage has no room for is refused whole; with storage blocked a restore loads into this tab only', async () => {
  await goto('progress');
  saveNow();
  const before = storage.getItem(KEY);
  dom.$('#export-backup').click();
  const backup = JSON.parse(await dom.blobs.at(-1).text());
  assert.deepEqual(backup.modelReviews, [], 'a backup always carries the practice-review list');
  // Room for this device's workspace, but not for a backup with a long proof draft.
  storage.quota = [...storage.data].reduce((n, [k, v]) => n + k.length + v.length, 0) + 2000;
  await choose(dom.$('#import-backup'), backupFile({...backup, proofDrafts: {[q1.id]: 'A long argument. '.repeat(1000)}}));
  dom.$('#confirm-import').click();
  assert.equal(toast(), 'Browser storage could not hold this backup, so it was not restored. Your workspace was left as it was.');
  assert.equal(storage.getItem(KEY), before);
  assert.equal(storage.getItem(REVIEWS), null, "the device's practice reviews are as they were");
  // With storage blocked, nothing on this device can be replaced: an active draft and a whole backup load
  // into this tab instead, which says why they are not saved.
  storage.quota = Infinity;
  storage.blocked = true;
  await choose(dom.$('#import-backup'), backupFile(draft));
  dom.$('#confirm-import').click();
  assert.equal(toast(), 'Backup restored in this tab only: browser storage is unavailable, so it is not saved on this device. Keep this tab open and export your work.');
  assert.match(dom.$('.local-status').innerHTML, /Storage unavailable/);
  await choose(dom.$('#import-backup'), backupFile({...backup, bookmarks: ['restored-here']}));
  dom.$('#confirm-import').click();
  assert.equal(toast(), 'Backup restored in this tab only: browser storage is unavailable, so it is not saved on this device. Keep this tab open and export your work.');
  assert.equal(dom.win.appUpdateCanReload(), false, 'an update must not reload work only this tab holds');
  dom.$('#export-backup').click();
  assert.deepEqual(JSON.parse(await dom.blobs.at(-1).text()).bookmarks, ['restored-here'], 'this tab holds the backup');
  storage.blocked = false;
  assert.equal(storage.getItem(KEY), before, 'and the workspace saved on this device is unchanged');
  assert.equal(storage.getItem(REVIEWS), null);
});

test('sessions another window removed to make room in a full storage leave this one too, and are not written back', async () => {
  await goto('progress');
  saveNow();
  const numeric = questionBank.filter(q => q.type === 'numeric').slice(0, 2);
  const older = [1, 2, 3].map(i => {
    const s = makeSession({id: 'older-' + i, title: 'Older ' + i, durationMinutes: 20, questions: numeric, maxMarks: null}, 1000 * i);
    s.attemptId = 'older-' + i;
    return finishSession(s, s.startedAt + 1000);
  });
  otherWindowSaves(w => { w.history = [...w.history, ...older]; });
  assert.ok(dom.main.innerHTML.includes('<strong>4</strong><small>Completed sessions'), 'this window shows the other one\'s sessions');
  // The other window saves a new draft into a storage that has no room for it and all the sessions, so the
  // oldest sessions make room, as saveWorkspace decides.
  const other = createWorkspaceStore(() => storage);
  const workspace = other.load().data;
  storage.quota = [...storage.data].reduce((n, [k, v]) => n + k.length + v.length, 0);
  const {ok, removed} = other.save({...workspace, proofDrafts: {...workspace.proofDrafts, [q2.id]: 'A draft. '.repeat(50)}});
  storage.quota = Infinity;
  assert.ok(ok && removed.length >= 1 && removed.length < 4);
  const kept = 4 - removed.length;
  dom.win.dispatchEvent(Object.assign(new Event('storage'), {key: KEY}));
  assert.ok(dom.main.innerHTML.includes(`<strong>${kept}</strong><small>Completed sessions`), 'this window shows what storage holds');
  // This window's next save keeps the other window's draft and does not bring the removed sessions back.
  dom.$('#motion').click();
  assert.equal(stored().paused, true);
  assert.deepEqual(stored().history.map(a => a.attemptId), workspace.history.slice(0, kept).map(a => a.attemptId));
  assert.equal(stored().proofDrafts[q2.id], 'A draft. '.repeat(50));
});
