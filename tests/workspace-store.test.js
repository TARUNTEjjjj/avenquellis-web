import test from 'node:test';
import assert from 'node:assert/strict';
import {WORKSPACE_KEY, createWorkspaceStore, keepUnreadable, mergeWorkspace, backupDrafts, createSaveScheduler, reopenSubmittedProof, keepDraft} from '../dist/lib/workspace-store.js';
import {saveWorkspace} from '../dist/lib/workspace-storage.js';
import {validateBackup} from '../dist/lib/backup.js';
import {modelReviewKey, replaceModelReviews} from '../dist/model-review.js';

// Same-origin localStorage: one store for every tab. `quota` counts key and value characters, as browsers do.
function memoryStorage({quota = Infinity} = {}) {
  const values = new Map();
  const used = () => [...values].reduce((n, [k, v]) => n + k.length + v.length, 0);
  const storage = {
    values,
    quota,
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      value = String(value);
      const before = values.has(key) ? key.length + values.get(key).length : 0;
      if (used() - before + key.length + value.length > storage.quota) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      values.set(key, value);
    },
    removeItem: key => void values.delete(key),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  return storage;
}
const empty = () => ({history: [], reviews: [], session: null, proofDraft: '', proofId: 'proof-1', paused: false,
  reviewQuestion: null, proofDrafts: {}, proofAttemptId: null, reviewAttemptId: null, bookmarks: []});
const normalize = data => ({...empty(), ...data});
const tab = storage => createWorkspaceStore(() => storage, {normalize});
const stored = storage => JSON.parse(storage.getItem(WORKSPACE_KEY));
const attempt = (id, answer = 'answer', extra = 0) => ({attemptId: id, startedAt: 1, finishedAt: 2, status: 'completed',
  questions: [{id: 'q1'}], answers: {q1: answer + 'x'.repeat(extra)}, results: [{id: 'q1', answer}]});

test('an unreadable saved workspace is kept aside before the first save replaces it', () => {
  const good = JSON.stringify({...empty(), history: [attempt('attempt-1')], bookmarks: ['q']});
  for (const damaged of [good.slice(0, -1), '"x"', '[1,2]', '42']) {
    const storage = memoryStorage();
    storage.setItem(WORKSPACE_KEY, damaged);
    const store = tab(storage);
    const loaded = store.load();
    assert.deepEqual(loaded.data, {});
    assert.equal(loaded.unreadable.text, damaged);
    assert.equal(storage.getItem(loaded.unreadable.copy), damaged);
    assert.equal(store.save(empty()).ok, true);
    assert.deepEqual(stored(storage), empty());
    assert.deepEqual(store.copies().map(c => storage.getItem(c.key)), [damaged]);
    // Reading the same damage again (another tab, a reload) does not pile up copies.
    storage.setItem(WORKSPACE_KEY, damaged);
    assert.equal(tab(storage).load().unreadable.copy, loaded.unreadable.copy);
    assert.equal(store.copies().length, 1);
  }
  const blank = memoryStorage();
  blank.setItem(WORKSPACE_KEY, 'null');
  assert.equal(tab(blank).load().unreadable, null);
});

test('without room for a second copy unreadable text moves aside, and it is never written over', () => {
  const damaged = '{"history":[' + 'x'.repeat(2000);
  const copyLength = WORKSPACE_KEY.length + '.unreadable.'.length + 13 + damaged.length;
  const roomy = memoryStorage({quota: copyLength + WORKSPACE_KEY.length + 400});
  roomy.setItem(WORKSPACE_KEY, damaged);
  const moved = tab(roomy), copy = moved.load().unreadable.copy;
  assert.equal(roomy.getItem(copy), damaged);
  assert.equal(moved.save(empty()).ok, true);
  assert.equal(roomy.getItem(copy), damaged);

  const tight = memoryStorage({quota: WORKSPACE_KEY.length + damaged.length});
  tight.setItem(WORKSPACE_KEY, damaged);
  const held = tab(tight), loaded = held.load();
  assert.equal(loaded.unreadable.copy, null);
  assert.equal(held.held, damaged);
  assert.equal(held.save(empty()).ok, false);
  assert.equal(held.sync(empty()), null);
  assert.equal(tight.getItem(WORKSPACE_KEY), damaged);
  // Once the learner deletes it, saving resumes.
  held.discard(WORKSPACE_KEY);
  assert.equal(held.save(empty()).ok, true);
  assert.deepEqual(stored(tight), empty());
});

test('unreadable text stays in place when storage refuses a copy for a reason other than being full', () => {
  const damaged = '{"history":[' + 'x'.repeat(2000);
  // Every write fails, as with Firefox's damaged storage file or storage the browser blocks; removals still work.
  const refusing = name => {
    const storage = memoryStorage();
    storage.setItem(WORKSPACE_KEY, damaged);
    storage.setItem = () => { throw new DOMException('The write was refused.', name); };
    return storage;
  };
  for (const name of ['NS_ERROR_FILE_CORRUPTED', 'SecurityError']) {
    // Moving the text aside would delete the only copy, which could not then be written back.
    const storage = refusing(name);
    assert.equal(keepUnreadable(storage, WORKSPACE_KEY, damaged), null);
    assert.equal(storage.getItem(WORKSPACE_KEY), damaged);
    const other = refusing(name), store = tab(other);
    assert.deepEqual(store.load().unreadable, {text: damaged, copy: null});
    assert.equal(store.held, damaged);
    const result = store.save(empty());
    assert.deepEqual([result.ok, result.full], [false, false]);
    assert.equal(other.getItem(WORKSPACE_KEY), damaged);
    assert.deepEqual([...other.values.keys()], [WORKSPACE_KEY]);
  }
});

test('unreadable text under the earlier app name stays there when it has no room for a copy, listed for download and delete', () => {
  const legacy = 'noether.v1', damaged = '{"history":[' + 'x'.repeat(2000);
  // Room for a new workspace, but not for a second copy of the old text.
  const storage = memoryStorage({quota: legacy.length + damaged.length + 300});
  storage.setItem(legacy, damaged);
  const store = tab(storage), loaded = store.load();
  assert.deepEqual(loaded, {data: {}, unreadable: {text: damaged, copy: null}});
  assert.equal(store.legacy, legacy);
  assert.deepEqual(store.copies(), []);
  // Nothing writes under the old name, so new work is saved beside it.
  assert.equal(store.held, null);
  assert.equal(store.save(empty()).ok, true);
  assert.equal(storage.getItem(legacy), damaged);
  store.discard(legacy);
  assert.equal(storage.getItem(legacy), null);
  assert.equal(store.legacy, null);
  assert.deepEqual(stored(storage), empty());
  // Only text this tab found unreadable is deleted: not a readable workspace, nor one stored there since.
  const readable = memoryStorage();
  readable.setItem(legacy, JSON.stringify({bookmarks: ['q1']}));
  const migrated = tab(readable);
  assert.deepEqual(migrated.load(), {data: {bookmarks: ['q1']}, unreadable: null});
  assert.equal(migrated.legacy, null);
  migrated.discard(legacy);
  assert.equal(readable.getItem(legacy), JSON.stringify({bookmarks: ['q1']}));
  const replaced = memoryStorage({quota: legacy.length + damaged.length + 300});
  replaced.setItem(legacy, damaged);
  const stale = tab(replaced);
  stale.load();
  replaced.setItem(legacy, '{}');
  assert.equal(stale.legacy, null);
  stale.discard(legacy);
  assert.equal(replaced.getItem(legacy), '{}');
  // With room, the copy is what gets listed, as for the current name.
  const roomy = memoryStorage();
  roomy.setItem(legacy, damaged);
  const copied = tab(roomy), copy = copied.load().unreadable.copy;
  assert.equal(roomy.getItem(copy), damaged);
  assert.equal(copied.legacy, null);
  assert.deepEqual(copied.copies().map(c => c.key), [copy]);
});

test('a saved practice-review list that cannot be read is kept aside before a new list replaces it', () => {
  const storage = memoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: storage});
  storage.setItem(modelReviewKey, '[{"key":"damaged"');
  assert.equal(replaceModelReviews([]), true);
  assert.equal(storage.getItem(modelReviewKey), '[]');
  const copies = [...storage.values.keys()].filter(k => k.startsWith(modelReviewKey + '.unreadable.'));
  assert.deepEqual(copies.map(k => storage.getItem(k)), ['[{"key":"damaged"']);
});

test('when storage is full, the oldest completed sessions make room as saveWorkspace decides, and a stale tab does not write them back', () => {
  const history = Array.from({length: 10}, (_, i) => attempt(`attempt-${9 - i}`, `answer ${i}`, 900));
  const saved = {...empty(), history, session: {attemptId: 'active', answers: {q1: 'my answer'}}, proofDrafts: {'proof-1': 'my draft'}};
  // The active test then grows by more than storage has room for.
  const state = {...saved, session: {attemptId: 'active', answers: {q1: 'my answer ' + 'y'.repeat(3500)}}};
  const quota = WORKSPACE_KEY.length + JSON.stringify(saved).length + 100;
  const storage = memoryStorage({quota}), store = tab(storage), other = tab(storage);
  storage.setItem(WORKSPACE_KEY, JSON.stringify(saved));
  store.load();
  const theirs = normalize(other.load().data);
  // As many of the newest sessions as fit beside current work stay; the active test and drafts always do.
  const keeping = count => ({...state, history: history.slice(0, count)});
  const fits = count => WORKSPACE_KEY.length + JSON.stringify(keeping(count)).length <= quota;
  const expected = [...Array(11).keys()].filter(fits).at(-1);
  assert.ok(expected > 0 && expected < 10);
  const result = store.save(state);
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.deepEqual(result.state, keeping(expected));
  assert.deepEqual(result.removed, history.slice(expected));
  assert.deepEqual(stored(storage), result.state);
  // Exactly what saveWorkspace stores on its own.
  const alone = memoryStorage({quota});
  alone.setItem(WORKSPACE_KEY, JSON.stringify(saved));
  assert.equal(saveWorkspace(alone, WORKSPACE_KEY, state), expected);
  assert.equal(alone.getItem(WORKSPACE_KEY), storage.getItem(WORKSPACE_KEY));
  // The next save of the active test leaves out nothing else, and this tab knows what it stored.
  const next = store.save({...result.state, session: {attemptId: 'active', answers: {q1: 'my-answer'}}});
  assert.deepEqual([next.ok, next.merged, next.removed], [true, false, []]);
  assert.equal(stored(storage).session.answers.q1, 'my-answer');
  // When even the newest session does not fit beside current work, the save fails and storage keeps what it held.
  const before = storage.getItem(WORKSPACE_KEY);
  const failed = store.save({...next.state, session: {attemptId: 'active', answers: {q1: 'z'.repeat(quota)}}});
  assert.deepEqual([failed.ok, failed.full, failed.changed, failed.removed], [false, true, false, []]);
  assert.equal(storage.getItem(WORKSPACE_KEY), before);
  // A tab that still shows all ten takes in the shorter history with its own change, and leaves the others out.
  const synced = other.save({...theirs, bookmarks: ['q1']});
  assert.deepEqual([synced.ok, synced.merged], [true, true]);
  assert.deepEqual(synced.state.history, history.slice(0, expected));
  assert.deepEqual(stored(storage), {...next.state, bookmarks: ['q1']});
});
test('a failed save says whether working storage had no room, or storage could not be used', () => {
  const state = {...empty(), proofDrafts: {'proof-1': 'my draft', 'proof-2': ''}};
  const insecure = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
  const failure = store => { const result = store.save(state); return [result.ok, result.full]; };
  // Storage answers, but has no room for this workspace, which holds no completed session that could make room.
  assert.deepEqual(failure(tab(memoryStorage({quota: 100}))), [false, true]);
  // The browser blocks storage: reading it throws, or so does every write.
  assert.deepEqual(failure(createWorkspaceStore(insecure, {normalize})), [false, false]);
  const refusing = memoryStorage();
  refusing.setItem = insecure;
  assert.deepEqual(failure(tab(refusing)), [false, false]);
  // Storage that stops working while the save looks for room.
  const failing = memoryStorage({quota: 100}), write = failing.setItem;
  let writes = 0;
  failing.setItem = (key, value) => (++writes > 1 ? insecure() : write(key, value));
  assert.deepEqual(failure(tab(failing)), [false, false]);
  assert.ok(writes > 1);
  // Unreadable text held in place is never written over, so this workspace is not saved there either.
  const damaged = '{"history":[' + 'x'.repeat(2000), tight = memoryStorage({quota: WORKSPACE_KEY.length + damaged.length});
  tight.setItem(WORKSPACE_KEY, damaged);
  const held = tab(tight);
  held.load();
  assert.deepEqual(failure(held), [false, false]);
});

test('a stale tab never writes over a test another tab completed', () => {
  const storage = memoryStorage(), tabA = tab(storage), tabB = tab(storage);
  tabA.load(); tabB.load();
  let a = tabA.save(empty()).state;
  const b = tabB.save(empty()).state;
  a = tabA.save({...a, history: [attempt('attempt-1', '2421')]}).state;
  // Tab B navigates with nothing new of its own: it takes in tab A's attempt instead of saving over it.
  const navigated = tabB.save(b);
  assert.equal(navigated.merged, true);
  assert.deepEqual(navigated.state.history, a.history);
  assert.deepEqual(stored(storage).history, a.history);
  // A tab that changed something else before it heard from tab A keeps both changes.
  const tabC = tab(storage);
  const c = normalize(tabC.load().data);
  a = tabA.save({...a, history: [attempt('attempt-2', '7'), ...a.history]}).state;
  const bookmarked = tabC.save({...c, bookmarks: ['q9']});
  assert.deepEqual(bookmarked.state.history.map(x => x.attemptId), ['attempt-2', 'attempt-1']);
  assert.deepEqual(bookmarked.state.bookmarks, ['q9']);
  assert.deepEqual(stored(storage), bookmarked.state);
  // Tab A takes in the bookmark on its next read, and nothing is new after that.
  const synced = tabA.sync(a);
  assert.deepEqual(synced.state, bookmarked.state);
  assert.equal(tabA.sync(synced.state), null);
});

test('a stale tab cannot finish an older copy of a test another tab already finished', () => {
  const session = {attemptId: 'attempt-5', startedAt: 1, answers: {}, flags: {}};
  const finished = {...attempt('attempt-5', '2421'), score: 10};
  const twoTabs = () => {
    const storage = memoryStorage();
    storage.setItem(WORKSPACE_KEY, JSON.stringify({...empty(), session}));
    const tabA = tab(storage), tabB = tab(storage);
    const a = normalize(tabA.load().data), b = normalize(tabB.load().data);
    tabA.save({...a, session: {...session, answers: {q1: '2421'}}});
    tabA.save({...a, history: [finished], session: null});
    return {storage, tabB, b};
  };
  // At its deadline tab B reads first and finds nothing left to finish.
  const first = twoTabs();
  const synced = first.tabB.sync(first.b);
  assert.equal(synced.state.session, null);
  assert.deepEqual(synced.state.history, [finished]);
  // Had tab B already stamped its stale copy as submitted, the finished attempt stays and the test does not reopen.
  const second = twoTabs();
  const stamped = second.tabB.save({...second.b, session: {...session, submittedAt: 3}});
  assert.equal(stamped.merged, true);
  assert.equal(stamped.state.session, null);
  assert.deepEqual(stamped.state.history, [finished]);
  assert.deepEqual(stored(second.storage), stamped.state);
});

test('two windows of one test keep the answers typed in each', () => {
  const session = {attemptId: 'attempt-5', startedAt: 1, questions: [{id: 'q1'}, {id: 'q2'}, {id: 'q3'}],
    answers: {q3: 'early'}, flags: {}, current: 0};
  const storage = memoryStorage();
  storage.setItem(WORKSPACE_KEY, JSON.stringify({...empty(), session}));
  const tabA = tab(storage), tabB = tab(storage);
  const a = normalize(tabA.load().data), b = normalize(tabB.load().data);
  // Window B saves question 2 and a flag while window A holds an answer to question 1 it has not saved yet.
  const theirs = {...b, session: {...session, answers: {q3: 'early', q2: 'from B'}, flags: {q2: true}, current: 1}};
  tabB.save(theirs);
  const mine = {...session, answers: {q3: 'early', q1: 'from A'}};
  const synced = tabA.sync({...a, session: mine});
  assert.deepEqual(synced.state.session, {...mine, answers: {q3: 'early', q1: 'from A', q2: 'from B'}, flags: {q2: true}});
  assert.deepEqual(stored(storage).session, synced.state.session);
  // Window B, with nothing new of its own since, then takes in the combined answers.
  assert.deepEqual(tabB.sync(theirs).state.session.answers, {q3: 'early', q1: 'from A', q2: 'from B'});
  const base = {...empty(), session};
  const merge = (ours, theirs) => mergeWorkspace(base, {...base, session: {...session, ...ours}}, {...base, session: {...session, ...theirs}}).session;
  // Both answered the same question: this window's answer stays. One it left alone follows the other window, even when cleared.
  assert.deepEqual(merge({answers: {q3: 'mine'}}, {answers: {q3: 'theirs'}}).answers, {q3: 'mine'});
  assert.deepEqual(merge({answers: {q3: 'early', q1: 'mine'}}, {answers: {q3: ''}}).answers, {q3: '', q1: 'mine'});
  assert.deepEqual(merge({flags: {q1: true}}, {flags: {q1: false, q2: true}}).flags, {q1: true, q2: true});
  // A test the other window submitted stays submitted, with the answer this window had not saved yet.
  const submitted = merge({answers: {q3: 'early', q1: 'late answer'}}, {submittedAt: 9, answers: {q3: 'early', q2: 'B'}});
  assert.equal(submitted.submittedAt, 9);
  assert.deepEqual(submitted.answers, {q3: 'early', q1: 'late answer', q2: 'B'});
  // Only this test's own questions are taken from the other window, and a different test is never mixed in.
  assert.deepEqual(merge({current: 2}, {answers: {q3: 'early', other: 'x'}}).answers, {q3: 'early'});
  const replaced = mergeWorkspace(base, {...base, session: {...session, current: 2}}, {...base, session: {...session, attemptId: 'attempt-6', answers: {q1: 'new test'}}});
  assert.deepEqual(replaced.session, {...session, current: 2});
});

test('merging keeps both tabs\' drafts and assessments, each attempt once, and restores in full', () => {
  const old = attempt('attempt-0');
  const base = {...empty(), history: [old], proofDrafts: {p1: 'one', p2: 'two'}, reviews: [{questionId: 'q', score: 1}]};
  const ours = {...base, history: [attempt('attempt-9', 'ours'), old], proofDrafts: {p1: 'one, edited here', p2: 'two'},
    reviews: [{questionId: 'q', score: 3}, ...base.reviews]};
  const theirs = {...base, history: [attempt('attempt-9', 'theirs'), old], proofDrafts: {p1: 'one', p2: 'two, edited there', p3: 'three'},
    reviews: [{questionId: 'q', score: 2}, ...base.reviews]};
  const merged = mergeWorkspace(base, ours, theirs);
  assert.deepEqual(merged.history.map(a => [a.attemptId, a.answers.q1]), [['attempt-9', 'theirs'], ['attempt-0', 'answer']]);
  assert.deepEqual(merged.proofDrafts, {p1: 'one, edited here', p2: 'two, edited there', p3: 'three'});
  assert.deepEqual(merged.reviews.map(r => r.score), [3, 2, 1]);
  // A restore in the other tab replaces its history; a test this tab finished meanwhile is still kept.
  const restored = mergeWorkspace(base, {...base, history: [attempt('attempt-7'), old]}, {...base, history: [attempt('attempt-r')]});
  assert.deepEqual(restored.history.map(a => a.attemptId), ['attempt-7', 'attempt-r']);
  // The open proof problem and its draft come from the same tab.
  const studio = mergeWorkspace(base, {...base, proofDraft: 'mine'}, {...base, proofId: 'proof-2', proofDraft: 'theirs'});
  assert.deepEqual([studio.proofId, studio.proofDraft], ['proof-1', 'mine']);
});

test('backups keep real drafts, leaving out empty slots and unedited copies of submitted answers first', () => {
  // As reported: a bank draft written first, then 64 mocks whose proofs were opened from their reports.
  const gcd = 'number-gcd-17s23lf';
  const history = Array.from({length: 64}, (_, i) => ({attemptId: `attempt-${i}`,
    questions: Array.from({length: 8}, (_, j) => ({id: `proof-${j}`})),
    answers: Object.fromEntries(Array.from({length: 8}, (_, j) => [`proof-${j}`, `submitted ${i}.${j}`]))}));
  const drafts = {[gcd]: 'Week 1: start of my gcd proof.', 'forged-1': ''};
  for (const a of history) for (const q of a.questions) drafts[`${a.attemptId}:${q.id}`] = a.answers[q.id];
  drafts['attempt-3:proof-1'] = 'submitted 3.1, then revised';
  assert.ok(Object.keys(drafts).length > 500);
  assert.ok(!(gcd in Object.fromEntries(Object.entries(drafts).slice(-500))), 'the earlier export trimming dropped it');
  const exported = backupDrafts(drafts, history);
  assert.equal(exported.omitted, 0);
  assert.deepEqual(exported.drafts, {[gcd]: 'Week 1: start of my gcd proof.', 'attempt-3:proof-1': 'submitted 3.1, then revised'});
  const backup = {schema: 'avenquellis-backup-v1', history: [], reviews: [], proofDrafts: exported.drafts};
  assert.deepEqual(validateBackup(backup).proofDrafts, exported.drafts);
  // More real drafts than a backup holds: preferred drafts stay, the oldest others give way, and the count is reported.
  const many = {[gcd]: 'my gcd proof', ...Object.fromEntries(Array.from({length: 520}, (_, i) => [`forged-${i}`, `draft ${i}`]))};
  const limited = backupDrafts(many, [], {prefer: slot => slot === gcd});
  assert.equal(limited.omitted, 21);
  assert.equal(Object.keys(limited.drafts).length, 500);
  assert.equal(limited.drafts[gcd], 'my gcd proof');
  assert.equal(limited.drafts['forged-0'], undefined);
  assert.equal(limited.drafts['forged-519'], 'draft 519');
  assert.doesNotThrow(() => validateBackup({...backup, proofDrafts: limited.drafts}));
});

test('typing is saved once it pauses, at least every two seconds while it continues, and at once on request', () => {
  let time = 0, saves = 0;
  const timers = new Map();
  let next = 1;
  const scheduler = createSaveScheduler(() => ++saves, {
    clock: () => time,
    setTimer: (fn, ms) => { timers.set(next, {fn, at: time + ms}); return next++; },
    clearTimer: id => timers.delete(id),
  });
  const advance = ms => {
    const end = time + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      time = due[1].at;
      due[1].fn();
    }
    time = end;
  };
  // Twenty keystrokes 100 ms apart: two seconds of continuous typing are written once.
  for (let i = 0; i < 20; i++) { scheduler.soon(); advance(100); }
  assert.equal(saves, 1);
  // Three more: nothing is written while typing, then once 400 ms after the last keystroke.
  for (let i = 0; i < 3; i++) { scheduler.soon(); advance(100); }
  assert.equal(saves, 1);
  advance(299);
  assert.equal(saves, 1);
  advance(1);
  assert.equal(saves, 2);
  assert.equal(scheduler.pending, false);
  // Another save, or leaving the page, writes what was waiting immediately and only once.
  scheduler.soon();
  assert.equal(scheduler.pending, true);
  scheduler.now();
  assert.equal(saves, 3);
  advance(5000);
  assert.equal(saves, 3);
});

test('a reopened submitted proof brings back the edited copy, and leaving the unedited answer never replaces it', () => {
  const submitted = 'My submitted proof.', slot = 'attempt-1:q1';
  // First reopening: the submitted answer, linked so that its assessment counts for the attempt.
  assert.deepEqual(reopenSubmittedProof({}, 'attempt-1', 'q1', submitted), {text: submitted, linked: true});
  // Edits go to the attempt's slot; reopening shows them, not linked.
  const drafts = keepDraft({}, slot, 'My rewritten proof.', submitted);
  assert.deepEqual(reopenSubmittedProof(drafts, 'attempt-1', 'q1', submitted), {text: 'My rewritten proof.', linked: false});
  // Leaving while the editor shows the unedited submitted answer keeps the edited copy.
  keepDraft(drafts, slot, submitted, submitted);
  assert.equal(drafts[slot], 'My rewritten proof.');
  // Other drafts are kept as before, and inherited names are never read as drafts.
  assert.equal(keepDraft(drafts, 'q2', 'Bank draft').q2, 'Bank draft');
  assert.deepEqual(reopenSubmittedProof({}, 'constructor', '', ''), {text: '', linked: true});
});
