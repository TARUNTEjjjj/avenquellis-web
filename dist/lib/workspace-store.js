// The saved workspace is one JSON value in localStorage, shared by every open tab of the app.
// A tab reads what is stored before it writes, so an older tab never replaces work another tab saved.
import { saveWorkspace, storageFull } from "./workspace-storage.js";

export const WORKSPACE_KEY = "avenquellis.workspace.v1";
const LEGACY_KEY = "noether.v1";
const COPY = ".unreadable.";

// A workspace is a JSON object; JSON null means nothing is saved. Anything else cannot be read.
function parseWorkspace(text) {
  try {
    const value = JSON.parse(text);
    if (value === null) return {};
    if (typeof value === "object" && !Array.isArray(value)) return value;
  } catch {}
  return null;
}

/** Saved text kept under `${key}.unreadable.<time>` because this release could not read it, oldest first. */
export function unreadableCopies(storage, key) {
  const copies = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const name = storage.key(i);
      if (name?.startsWith(key + COPY))
        copies.push({
          key: name,
          savedAt: Number(name.slice(key.length + COPY.length)) || null,
        });
    }
  } catch {}
  return copies.sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0));
}

/**
 * Keep text this release cannot read under `${key}.unreadable.<time>` before anything replaces it.
 * Without room for a second copy, text stored under `key` moves there instead.
 * Returns the copy's key, or null when the text could not be kept.
 */
export function keepUnreadable(storage, key, text, { from = key, now = Date.now() } = {}) {
  try {
    const existing = unreadableCopies(storage, key).find(
      (copy) => storage.getItem(copy.key) === text,
    );
    if (existing) return existing.key;
    let time = now;
    while (storage.getItem(key + COPY + time) !== null) time++;
    const copy = key + COPY + time;
    try {
      storage.setItem(copy, text);
      return copy;
    } catch (error) {
      if (!storageFull(error) || from !== key || storage.getItem(key) !== text) return null;
    }
    storage.removeItem(key);
    try {
      storage.setItem(copy, text);
      return copy;
    } catch {
      storage.setItem(key, text);
      return null;
    }
  } catch {
    return null;
  }
}

const json = (value) => JSON.stringify(value ?? null);
const own = (object, key) =>
  object && Object.hasOwn(object, key) ? object[key] : undefined;

// The other tab's list, without what this tab removed, plus what only this tab added.
function mergeList(base = [], ours = [], theirs = [], identity, newestFirst = true) {
  const before = new Set(base.map(identity)),
    here = new Set(ours.map(identity)),
    there = new Set(theirs.map(identity));
  const added = ours.filter(
    (item) => !before.has(identity(item)) && !there.has(identity(item)),
  );
  const kept = theirs.filter(
    (item) => here.has(identity(item)) || !before.has(identity(item)),
  );
  return newestFirst ? [...added, ...kept] : [...kept, ...added];
}
function mergeDrafts(base, ours, theirs) {
  const slots = new Set([...Object.keys(theirs ?? {}), ...Object.keys(ours ?? {})]);
  return Object.fromEntries(
    [...slots].flatMap((slot) => {
      const value =
        own(ours, slot) !== own(base, slot) ? own(ours, slot) : own(theirs, slot);
      return value === undefined ? [] : [[slot, value]];
    }),
  );
}
// The open proof-studio problem and its draft always come from the same tab.
const STUDIO = ["proofDraft", "proofId", "reviewQuestion", "proofAttemptId", "reviewAttemptId"];
// One active test that both tabs hold and both changed. Answers and flags combine question by question, as
// drafts do: what this tab changed stays, and the rest comes from the other tab, for this test's own
// questions only. A test either tab has submitted stays submitted. The open question is this tab's.
function mergeSession(base, ours, theirs) {
  const before = base?.attemptId === ours.attemptId ? base : null,
    questions = new Set((ours.questions ?? []).map((question) => question?.id));
  const perQuestion = (field) => {
    const mine = ours[field] ?? {},
      result = { ...mine };
    for (const [id, value] of Object.entries(theirs[field] ?? {}))
      if (questions.has(id) && own(mine, id) === own(before?.[field], id)) result[id] = value;
    return result;
  };
  return {
    ...ours,
    answers: perQuestion("answers"),
    flags: perQuestion("flags"),
    ...(ours.submittedAt == null && theirs.submittedAt != null
      ? { submittedAt: theirs.submittedAt }
      : {}),
  };
}

/**
 * Combine this tab's workspace with one another tab saved. `base` is what this tab last read or wrote.
 * A part only one side changed comes from that side. When both changed it, completed attempts,
 * assessments, drafts, bookmarks and the answers of a test both tabs hold are kept from both sides, and
 * this tab's latest action wins elsewhere.
 */
export function mergeWorkspace(base, ours, theirs) {
  const merged = { ...theirs };
  const changed = (side, fields) =>
    fields.some((field) => json(side[field]) !== json(base[field]));
  const part = (fields, resolve) => {
    if (!changed(ours, fields)) return;
    if (changed(theirs, fields)) resolve();
    else for (const field of fields) merged[field] = ours[field];
  };
  part(["history"], () => {
    merged.history = mergeList(base.history, ours.history, theirs.history, (a) => a?.attemptId);
  });
  part(["reviews"], () => {
    merged.reviews = mergeList(base.reviews, ours.reviews, theirs.reviews, json);
  });
  part(["proofDrafts"], () => {
    merged.proofDrafts = mergeDrafts(base.proofDrafts, ours.proofDrafts, theirs.proofDrafts);
  });
  part(["bookmarks"], () => {
    merged.bookmarks = mergeList(base.bookmarks, ours.bookmarks, theirs.bookmarks, (id) => id, false);
  });
  part(STUDIO, () => {
    for (const field of STUDIO) merged[field] = ours[field];
  });
  part(["paused"], () => {
    merged.paused = ours.paused;
  });
  part(["session"], () => {
    const id = ours.session?.attemptId,
      finished = (list) => Array.isArray(list) && list.some((a) => a?.attemptId === id);
    // A test the other tab has finished must not become active again here.
    if (id != null && finished(theirs.history) && !finished(base.history))
      merged.session = theirs.session;
    else
      merged.session =
        id != null && theirs.session?.attemptId === id
          ? mergeSession(base.session, ours.session, theirs.session)
          : ours.session;
  });
  return merged;
}

// Submitted answers, by the draft slot that a copy of them is kept under: `${attemptId}:${questionId}`.
function submittedAnswers(history) {
  const submitted = new Map();
  for (const attempt of Array.isArray(history) ? history : [])
    for (const question of attempt?.questions ?? [])
      submitted.set(
        `${attempt.attemptId}:${question?.id}`,
        attempt.answers?.[question?.id] || "",
      );
  return submitted;
}

/**
 * Choose the proof drafts a backup carries; a backup holds at most `limit`. Empty drafts and unedited
 * copies of submitted answers are already in the backup, so they are left out first. If that is not
 * enough, the oldest drafts that are not `prefer`red go next, and `omitted` says how many.
 */
export function backupDrafts(drafts, history = [], { limit = 500, prefer = () => false } = {}) {
  const submitted = submittedAnswers(history);
  const entries = Object.entries(drafts && typeof drafts === "object" ? drafts : {}).filter(
    ([slot, text]) => typeof text === "string" && text !== "" && submitted.get(slot) !== text,
  );
  const omitted = Math.max(0, entries.length - limit);
  if (!omitted) return { drafts: Object.fromEntries(entries), omitted };
  const order = [
    ...entries.filter(([slot]) => !prefer(slot)),
    ...entries.filter(([slot]) => prefer(slot)),
  ];
  const left = new Set(order.slice(0, omitted).map(([slot]) => slot));
  return {
    drafts: Object.fromEntries(entries.filter(([slot]) => !left.has(slot))),
    omitted,
  };
}

/**
 * Reopening a submitted proof from its report: the learner's edited copy, kept under
 * `${attemptId}:${questionId}`, opens again; without one the submitted answer opens. Only the unedited
 * submitted answer is `linked`, so that an assessment of it counts for the attempt.
 */
export function reopenSubmittedProof(drafts, attemptId, questionId, submitted) {
  const edited = own(drafts, `${attemptId}:${questionId}`);
  const text = typeof edited === "string" ? edited : submitted;
  return { text, linked: text === submitted };
}

/**
 * Keep the editor's text in its draft slot when the learner leaves it. An unedited submitted answer is
 * already in the history, and storing it would replace the learner's edited copy of that proof.
 */
export function keepDraft(drafts, slot, text, submitted = null) {
  if (text !== submitted) drafts[slot] = text;
  return drafts;
}

/**
 * Coalesce saves that come in quick succession, such as one per keystroke. Each save serializes the whole
 * workspace, so soon() saves once the calls pause for `delay` ms, and at least every `maxWait` ms while
 * they continue. now() saves at once, taking along anything soon() was holding.
 */
export function createSaveScheduler(
  save,
  { delay = 400, maxWait = 2000, setTimer = setTimeout, clearTimer = clearTimeout, clock = Date.now } = {},
) {
  let timer = null,
    first = 0;
  function now() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    return save();
  }
  function soon() {
    const time = clock();
    if (timer === null) first = time;
    else clearTimer(timer);
    timer = setTimer(() => now(), Math.max(0, Math.min(delay, first + maxWait - time)));
  }
  return {
    now,
    soon,
    get pending() {
      return timer !== null;
    },
  };
}

/**
 * One tab's view of the saved workspace. `getStorage` returns localStorage; reading that property can
 * itself throw when the browser blocks storage. `normalize` turns saved data into a complete workspace.
 * save() and sync() return {ok, full, state, changed, merged, removed}: `state` is what this tab should now
 * hold, and `changed` says it is not what the tab passed in. `merged` says another tab's work was combined
 * in. `removed` lists the oldest completed sessions that this save left out to fit a full browser storage,
 * as saveWorkspace decides. When a save fails, `full` says storage works but has no room for this workspace
 * even then, and what it holds is left as it was; otherwise storage is unavailable, or holds unreadable
 * text that is not written over.
 */
export function createWorkspaceStore(
  getStorage,
  { key = WORKSPACE_KEY, legacyKey = LEGACY_KEY, normalize = (data) => data } = {},
) {
  let text = null; // what this tab last read from or wrote under `key`
  let held = null; // unreadable saved text with no room for a copy; it is never written over
  let legacy = null; // unreadable text that stays under `legacyKey`, with no room for a copy either
  const failed = (state, full = false) => ({
    ok: false,
    full,
    state,
    changed: false,
    merged: false,
    removed: [],
  });

  function keep(value, from) {
    let copy = null;
    try {
      const storage = getStorage();
      copy = keepUnreadable(storage, key, value, { from });
      text = storage.getItem(key);
    } catch {}
    if (!copy && from === key) held = value;
    return copy;
  }

  // Take in what another tab stored since this tab last read or wrote. Null keeps this tab's state.
  function combine(ours, current) {
    const previous = text;
    text = current;
    if (current === null) return null;
    const data = parseWorkspace(current);
    if (!data) {
      keep(current, key);
      return null;
    }
    const theirs = normalize(data);
    if (JSON.stringify(ours) === previous) return theirs;
    return mergeWorkspace(normalize(parseWorkspace(previous) ?? {}), ours, theirs);
  }

  function write(state, storage, full) {
    try {
      storage.setItem(key, full);
      text = full;
      return { ok: true, state, merged: false, removed: [] };
    } catch (error) {
      if (!storageFull(error)) return failed(state);
    }
    // Storage is full: the oldest completed sessions make room for current work, never the newest, as
    // saveWorkspace decides. If even that does not fit, the save fails and what is stored stays as it was.
    try {
      const kept = saveWorkspace(storage, key, state),
        fitted = kept < state.history.length ? { ...state, history: state.history.slice(0, kept) } : state;
      text = JSON.stringify(fitted);
      return { ok: true, state: fitted, merged: false, removed: state.history.slice(kept) };
    } catch (error) {
      return failed(state, storageFull(error));
    }
  }

  /** Read the saved workspace once at startup. Unreadable text is kept aside before anything can replace it. */
  function load() {
    let current = null,
      from = key;
    try {
      const storage = getStorage();
      current = storage.getItem(key);
      if (current === null && legacyKey) {
        from = legacyKey;
        current = storage.getItem(legacyKey);
      }
    } catch {
      return { data: {}, unreadable: null };
    }
    text = from === key ? current : null;
    if (current === null) return { data: {}, unreadable: null };
    const data = parseWorkspace(current);
    if (data) return { data, unreadable: null };
    const copy = keep(current, from);
    // Nothing writes under the legacy key, so text that has no room for a copy stays there, to be listed.
    if (!copy && from !== key) legacy = current;
    return { data: {}, unreadable: { text: current, copy } };
  }

  /** Save this tab's workspace, first combining in anything another tab saved. */
  function save(state) {
    if (held !== null) return failed(state);
    let storage, current;
    try {
      storage = getStorage();
      current = storage.getItem(key);
    } catch {
      return failed(state);
    }
    let next = state,
      merged = false;
    if (current !== text) {
      const combined = combine(state, current);
      if (held !== null) return failed(state);
      if (combined) {
        next = combined;
        merged = true;
      }
    }
    const full = JSON.stringify(next),
      result =
        full === current
          ? { ok: true, state: next, merged, removed: [] }
          : { ...write(next, storage, full), merged };
    return { ...result, changed: result.state !== state };
  }

  /** Take in what another tab saved. Null when nothing changed. */
  function sync(state) {
    if (held !== null) return null;
    let current;
    try {
      current = getStorage().getItem(key);
    } catch {
      return null;
    }
    if (current === text) return null;
    const combined = combine(state, current);
    if (!combined) return null;
    return { ...save(combined), changed: true, merged: true };
  }

  function copies(name = key) {
    try {
      return unreadableCopies(getStorage(), name);
    } catch {
      return [];
    }
  }

  /** Delete unreadable text the learner no longer needs: a kept copy, or text left in place under a key. */
  function discard(name) {
    if (name === legacyKey && name !== key) {
      // Only the text this tab found unreadable is deleted, never a workspace stored there since.
      try {
        const storage = getStorage();
        if (legacy !== null && storage.getItem(legacyKey) === legacy) storage.removeItem(legacyKey);
      } catch {}
      legacy = null;
      return;
    }
    if (name !== key) {
      try {
        if (name.includes(COPY)) getStorage().removeItem(name);
      } catch {}
      return;
    }
    if (held === null) return;
    try {
      const storage = getStorage();
      if (storage.getItem(key) === held) storage.removeItem(key);
    } catch {}
    // Saving resumes. Anything another tab stored meanwhile is combined in on the next save.
    text = held;
    held = null;
  }

  return {
    load,
    save,
    sync,
    copies,
    discard,
    get held() {
      return held;
    },
    /** The legacy key, while unreadable text that had no room for a copy is still stored under it. */
    get legacy() {
      try {
        if (legacy !== null && getStorage().getItem(legacyKey) === legacy) return legacyKey;
      } catch {}
      return null;
    },
  };
}
