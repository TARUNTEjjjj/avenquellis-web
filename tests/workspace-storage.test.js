import test from 'node:test';
import assert from 'node:assert/strict';
import {saveWorkspace, storageFull} from '../dist/lib/workspace-storage.js';

// Browsers count the characters of every key and value a site stores against one quota.
class SiteStorage {
  constructor(capacity, name = 'QuotaExceededError') {
    Object.assign(this, {capacity, name, items:new Map(), writes:0});
  }
  setItem(key, value) {
    this.writes++;
    let used = key.length + value.length;
    for (const [k, v] of this.items) if (k !== key) used += k.length + v.length;
    if (used > this.capacity) throw new DOMException('The quota has been exceeded.', this.name);
    this.items.set(key, value);
  }
  getItem(key) { return this.items.get(key) ?? null; }
}
const attempt = i => ({attemptId:`attempt-${i}`, answers:{q1:`Proof ${i} `.padEnd(1000, 'x')}});
const workspace = (count, answer = 'Current answer') => ({
  history:Array.from({length:count}, (_, i) => attempt(i)),
  reviews:[], session:{attemptId:'active', answers:{q1:answer}}, proofDraft:'Draft', bookmarks:['bank-1'],
});

test('a workspace that fits is saved exactly as before in a single write', () => {
  const storage = new SiteStorage(100000), saved = workspace(5);
  assert.equal(saveWorkspace(storage, 'key', saved), 5);
  assert.equal(storage.getItem('key'), JSON.stringify(saved));
  assert.equal(storage.writes, 1);
});

test('when storage is full, the oldest completed sessions make room and current work is saved', () => {
  const saved = workspace(6);
  const storage = new SiteStorage(JSON.stringify({...saved, history:saved.history.slice(0, 4)}).length + 3 + 50);
  assert.equal(saveWorkspace(storage, 'key', saved), 4);
  const stored = JSON.parse(storage.getItem('key'));
  assert.deepEqual(stored.history.map(a => a.attemptId), ['attempt-0', 'attempt-1', 'attempt-2', 'attempt-3']);
  assert.deepEqual(stored.session, saved.session);
  assert.equal(stored.proofDraft, 'Draft');
  assert.deepEqual(Object.keys(stored), Object.keys(saved));
  assert.equal(saved.history.length, 6, 'The caller decides what to keep in memory.');
});

test('space used by other keys and Firefox\'s older error name are handled', () => {
  const saved = workspace(5), reviews = ['avenquellis.prose-reviews.v1', 'r'.repeat(2000)];
  const storage = new SiteStorage(reviews.join('').length + 3 + JSON.stringify({...saved, history:saved.history.slice(0, 2)}).length + 50,
    'NS_ERROR_DOM_QUOTA_REACHED');
  storage.items.set(...reviews);
  assert.equal(saveWorkspace(storage, 'key', saved), 2);
  assert.equal(JSON.parse(storage.getItem('key')).history.length, 2);
  assert.equal(storage.getItem(reviews[0]), reviews[1]);
});

test('the newest session is never dropped, and nothing changes when even it does not fit', () => {
  const storage = new SiteStorage(4000);
  storage.setItem('key', 'previous workspace');
  assert.throws(() => saveWorkspace(storage, 'key', workspace(3, 'a'.repeat(3000))), {name:'QuotaExceededError'});
  assert.equal(storage.getItem('key'), 'previous workspace');
  assert.throws(() => saveWorkspace(storage, 'key', workspace(1, 'a'.repeat(3000))), {name:'QuotaExceededError'});
  assert.throws(() => saveWorkspace(storage, 'key', workspace(0, 'a'.repeat(4000))), {name:'QuotaExceededError'});
  assert.equal(storage.getItem('key'), 'previous workspace');
});

test('unavailable storage is not mistaken for a full one', () => {
  let writes = 0;
  const blocked = {setItem() {writes++; throw new DOMException('Access is denied.', 'SecurityError');}};
  assert.throws(() => saveWorkspace(blocked, 'key', workspace(5)), {name:'SecurityError'});
  assert.equal(writes, 1);
  assert.equal(storageFull(new TypeError('localStorage is null')), false);
  assert.equal(storageFull(new DOMException('Full', 'QuotaExceededError')), true);
});
