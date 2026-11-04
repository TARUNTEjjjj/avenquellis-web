import { validateQuestion } from "./grader.js";
import { parseNumber, validSession, finishSession } from "./session.js";

const TOPICS = new Set([
  "algebra",
  "number-theory",
  "combinatorics",
  "geometry",
  "calculus",
  "probability",
]);
const LEVELS = new Set(["foundation", "advanced", "olympiad"]);
const HOSTS = new Set([
  "www.cmi.ac.in",
  "admission.isical.ac.in",
  "olympiads.hbcse.tifr.res.in",
]);
const KINDS = new Set([
  "official-paper",
  "official-sample",
  "official-solutions",
  "official-archive",
  "official-paper-with-solutions",
]);
const fail = (message) => {
  throw new TypeError(`Invalid backup: ${message}`);
};
const object = (value, label) => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    fail(`${label} must be an object.`);
  return value;
};
const text = (value, label, max = 50000, empty = true) => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.trim())
  )
    fail(`${label} must be text of at most ${max} characters.`);
  return value;
};
const number = (value, label, min, max, integer = false) => {
  if (
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    fail(`${label} is out of range.`);
  return value;
};
const id = (value, label) => {
  text(value, label, 200, false);
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value) ||
    Object.hasOwn(Object.prototype, value) ||
    value === "prototype"
  )
    fail(`${label} is not a safe identifier.`);
  return value;
};
const list = (value, label, max) => {
  if (!Array.isArray(value) || value.length > max)
    fail(`${label} must contain at most ${max} entries.`);
  return value;
};
const nullableId = (value, label) => (value == null ? null : id(value, label));
const time = (value, label) => number(value, label, 0, 8640000000000000, true);
function url(value) {
  text(value, "source URL", 2000, false);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("Malformed source URL.");
  }
  if (
    parsed.protocol !== "https:" ||
    !HOSTS.has(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.port
  )
    fail("Source URL is not on an allowed official host.");
  return parsed.href;
}
function source(value, reference) {
  object(value, "question source");
  const kind = text(value.kind, "source kind", 40, false);
  if (reference ? !KINDS.has(kind) : kind !== "original")
    fail("Unexpected question source kind.");
  const result = { kind, label: text(value.label, "source label", 500, false) };
  if (reference) result.url = url(value.url);
  else if (value.url !== undefined)
    fail("Original questions cannot provide an external source URL.");
  if (value.rights !== undefined)
    result.rights = text(value.rights, "source rights", 1000);
  return result;
}
function criteria(value, awarded = false) {
  const seen = new Set();
  return list(value, "rubric", 30).map((c) => {
    object(c, "criterion");
    const key = id(c.id, "criterion id");
    if (seen.has(key)) fail("Repeated criterion id.");
    seen.add(key);
    const out = {
      id: key,
      description: text(c.description, "criterion description", 3000, false),
      points: number(c.points, "criterion points", 1, 1000, true),
    };
    if (awarded)
      out.awarded = number(c.awarded, "awarded points", 0, out.points, true);
    return out;
  });
}
function question(value) {
  object(value, "question");
  if (!["numeric", "proof", "reference"].includes(value.type))
    fail("Unknown question type.");
  const reference = value.type === "reference";
  if (!TOPICS.has(value.topic) && !(reference && value.topic === "reference"))
    fail("Unknown question topic.");
  const q = {
    id: id(value.id, "question id"),
    title: text(value.title, "question title", 500, false),
    statement: text(value.statement, "question statement", 50000, false),
    topic: value.topic,
    type: value.type,
    maxMarks:
      reference && value.maxMarks == null
        ? null
        : number(value.maxMarks, "question marks", 1, 1000, true),
    source: source(value.source, reference),
  };
  if (!reference) {
    q.solution = text(value.solution, "solution", 50000, false);
    q.rubric = criteria(value.rubric);
    validateQuestion(q);
    if (value.type === "numeric") {
      if (typeof value.answer !== "number" && typeof value.answer !== "string")
        fail("Numeric answer is missing.");
      if (typeof value.answer === "string")
        text(value.answer, "numeric answer", 200, false);
      if (parseNumber(value.answer) === null)
        fail("Invalid numeric answer key.");
      q.answer = value.answer;
    }
  }
  if (value.difficulty !== undefined) {
    if (!LEVELS.has(value.difficulty)) fail("Unknown difficulty.");
    q.difficulty = value.difficulty;
  }
  if (value.requestedDifficulty !== undefined) {
    if (!LEVELS.has(value.requestedDifficulty))
      fail("Unknown requested difficulty.");
    q.requestedDifficulty = value.requestedDifficulty;
  }
  if (value.exam !== undefined) {
    if (!["CMI", "ISI", "RMO"].includes(value.exam)) fail("Unknown exam.");
    q.exam = value.exam;
  }
  if (value.templateId !== undefined)
    q.templateId = id(value.templateId, "template id");
  if (value.parameters !== undefined) {
    object(value.parameters, "parameters");
    q.parameters = {};
    if (Object.keys(value.parameters).length > 30) fail("Too many parameters.");
    for (const [k, v] of Object.entries(value.parameters))
      q.parameters[id(k, "parameter key")] = Array.isArray(v)
        ? list(v, "parameter values", 100).map((n) =>
            number(n, "parameter", -1e15, 1e15),
          )
        : number(v, "parameter", -1e15, 1e15);
  }
  if (value.generator !== undefined) {
    object(value.generator, "generator");
    q.generator = {
      kind: text(value.generator.kind, "generator kind", 100, false),
      version: text(value.generator.version, "generator version", 100, false),
      seed: text(value.generator.seed, "generator seed", 300),
    };
  }
  return q;
}
function session(value, completed = false) {
  object(value, "session");
  if (!validSession({ ...value, status: "active" })) fail("Malformed session.");
  if (value.status !== (completed ? "completed" : "active"))
    fail("Unexpected session status.");
  const questions = list(value.questions, "questions", 60).map(question);
  const ids = new Set(questions.map((q) => q.id));
  if (ids.size !== questions.length) fail("Repeated question id.");
  const durationMinutes = number(value.durationMinutes, "duration", 1, 1440);
  const startedAt = time(value.startedAt, "start time"),
    deadline = time(value.deadline, "deadline");
  if (Math.abs(deadline - (startedAt + durationMinutes * 60000)) > 1)
    fail("Deadline does not match the saved start and duration.");
  const answers = {},
    flags = {};
  object(value.answers, "answers");
  object(value.flags, "flags");
  for (const [key, a] of Object.entries(value.answers)) {
    if (!ids.has(key)) fail("Answer does not belong to this session.");
    answers[key] = text(a, "answer", 50000);
  }
  for (const [key, f] of Object.entries(value.flags)) {
    if (!ids.has(key) || typeof f !== "boolean") fail("Invalid review flag.");
    flags[key] = f;
  }
  const s = {
    id: id(value.id, "test id"),
    attemptId: id(value.attemptId, "attempt id"),
    title: text(value.title, "test title", 500, false),
    questions,
    durationMinutes,
    startedAt,
    deadline,
    answers,
    flags,
    current: number(
      value.current,
      "current question",
      0,
      questions.length - 1,
      true,
    ),
    status: completed ? "completed" : "active",
    reference: value.reference === true,
    maxMarks:
      value.maxMarks == null
        ? null
        : number(value.maxMarks, "test marks", 0, 60000, true),
  };
  if (value.exam !== undefined) {
    if (!["CMI", "ISI", "RMO"].includes(value.exam)) fail("Unknown test exam.");
    s.exam = value.exam;
  }
  if (completed) {
    const finishedAt = time(value.finishedAt, "finish time");
    if (finishedAt < startedAt) fail("Finish time precedes start time.");
    return finishSession(s, finishedAt);
  }
  return s;
}
function review(value) {
  object(value, "assessment");
  const maxMarks = number(value.maxMarks, "assessment maximum", 1, 1000, true),
    score = number(value.score, "assessment score", 0, maxMarks, true),
    cs = criteria(value.criteria, true);
  if (
    cs.reduce((n, c) => n + c.points, 0) !== maxMarks ||
    cs.reduce((n, c) => n + c.awarded, 0) !== score
  )
    fail("Assessment points do not add up.");
  const reviewedAt = text(value.reviewedAt, "review time", 100, false);
  if (!Number.isFinite(Date.parse(reviewedAt)))
    fail("Invalid assessment date.");
  return {
    schemaVersion: "1.0",
    questionId: nullableId(value.questionId, "review question id"),
    attemptId: nullableId(value.attemptId, "review attempt id"),
    questionTitle: text(value.questionTitle, "review title", 500, false),
    score,
    maxMarks,
    criteria: cs,
    reviewer: text(value.reviewer, "reviewer", 200, false),
    rationale: text(value.rationale, "rationale", 50000, false),
    answer: text(value.answer ?? "", "reviewed answer", 50000),
    reviewedAt,
    status: "human_reviewed",
    reviewerIdentityVerified: false,
    imported: true,
    notice:
      "Imported local assessment. Reviewer identity and mathematical accuracy are not verified.",
  };
}

/** Restore suggestions as unverified practice records. Recalculate totals from criterion marks. */
export function validateModelReviews(value, imported = true) {
  const records = list(value, "model reviews", 40);
  const seen = new Set();
  const keys = new Set();
  return records.map((record) => {
    object(record, "model review record");
    const key = text(record.key, "review key", 64, false);
    if (!/^[a-f0-9]{64}$/.test(key)) fail("Invalid review key.");
    const r = object(record.review, "model review");
    if (!["workers-ai", "browser-webllm"].includes(r.provider)) fail("Unknown model provider.");
    const pair = `${key}:${r.provider}`;
    keys.add(key);
    if (keys.size > 20 || seen.has(pair)) fail("Repeated review or too many reviewed answers.");
    seen.add(pair);
    const date = text(r.date, "model review date", 40, false);
    if (!Number.isFinite(Date.parse(date))) fail("Invalid model review date.");
    const max = number(r.max, "model maximum", 1, 1000, true);
    const rubricIds = new Set();
    const criteria = list(r.criteria, "model rubric", 30).map((c) => {
      object(c, "model criterion");
      const criterionId = id(c.id, "model criterion id");
      if (rubricIds.has(criterionId)) fail("Repeated model criterion.");
      rubricIds.add(criterionId);
      const maxPoints = number(c.maxPoints, "criterion maximum", 1, max, true);
      const reviewers = list(c.reviewers, "criterion readings", 2).map((v, index) => {
        object(v, "criterion reading");
        if (v.reviewer !== index + 1) fail("Invalid criterion reader.");
        return {reviewer: v.reviewer, points: v.points === null ? null : number(v.points, "reading points", 0, maxPoints, true),
          quotes: list(v.quotes, "reading excerpts", 100).map(q => text(q, "reading excerpt", 6000, false))};
      });
      if (reviewers.length !== 2) fail("Missing criterion reading.");
      const [a, b] = reviewers.map(v => v.points);
      const matched = a !== null && a === b;
      return {id: criterionId, description: text(c.description, "criterion description", 3000, false), maxPoints, reviewers,
        agreedPoints: matched ? a : null, status: matched ? "agreement" : a === null || b === null ? "insufficient_reviews" : "disagreement"};
    });
    if (criteria.reduce((n,c) => n + c.maxPoints, 0) !== max) fail("Invalid model rubric total.");
    const reviews = list(r.reviews, "model readings", 2).map((v, index) => {
      object(v, "model reading");
      if (v.number !== index + 1 || !["proposal", "failed", "invalid"].includes(v.status)) fail("Invalid model reading.");
      const reading = {number: v.number, status: v.status};
      const points = criteria.map(c => c.reviewers[index].points);
      if (v.status === "proposal") {
        if (points.includes(null) || points.reduce((a, b) => a + b, 0) !== v.score) fail("Reading marks do not add up.");
        reading.score = v.score;
        reading.rationale = text(v.rationale, "model rationale", 10000, false);
        reading.gaps = list(v.gaps, "model gaps", 50).map(g => text(g, "model gap", 2000));
      } else if (points.some(p => p !== null)) fail("Failed reading cannot award marks.");
      if (v.code != null) reading.code = text(v.code, "model error", 100);
      return reading;
    });
    if (reviews.length !== 2 || !reviews.some(v => v.status === "proposal")) fail("Missing model proposal.");
    const both = reviews.every(v => v.status === "proposal");
    const scores = reviews.map(v => v.score);
    const agreed = both && criteria.every(c => c.status === "agreement");
    const suggested = agreed ? scores[0] : null;
    if (r.suggested !== suggested) fail("Suggestion contradicts the readings.");
    return {key, review: {model: text(r.model, "model", 200, false), provider: r.provider,
      promptVersion: text(r.promptVersion, "model prompt version", 200, false), date, max, suggested,
      range: both ? {min: Math.min(...scores), max: Math.max(...scores)} : null,
      criteria, reviews, imported: imported || r.imported === true}};
  });
}

/** Validate then whitelist all persisted fields. This never trusts imported scores. */
export function validateBackup(raw) {
  if (typeof raw === "string") {
    if (raw.length > 10000000) fail("File exceeds 10 MB.");
    try {
      raw = JSON.parse(raw);
    } catch {
      fail("Malformed JSON.");
    }
  }
  object(raw, "root");
  if (!["avenquellis-backup-v1", "noether-backup-v1"].includes(raw.schema)) {
    if (!validSession(raw)) fail("Unsupported backup format.");
    return {
      mode: "active",
      history: [],
      reviews: [],
      session: session(raw),
      proofDraft: "",
      proofId: null,
      reviewQuestion: null,
      proofDrafts: {},
      proofAttemptId: null,
      reviewAttemptId: null,
      bookmarks: [],
    };
  }
  const history = list(raw.history, "history", 100).map((a) =>
    session(a, true),
  );
  if (new Set(history.map((a) => a.attemptId)).size !== history.length)
    fail("Repeated attempt id.");
  const reviews = list(raw.reviews, "reviews", 100).map(review);
  const active = raw.session == null ? null : session(raw.session);
  const proofDraft = text(raw.proofDraft ?? "", "proof draft", 50000),
    proofId = nullableId(raw.proofId, "proof id");
  const reviewQuestion =
    raw.reviewQuestion == null ? null : question(raw.reviewQuestion);
  if (reviewQuestion && reviewQuestion.type !== "proof")
    fail("The proof studio requires a proof question.");
  const proofDrafts = {};
  if (raw.proofDrafts != null) {
    object(raw.proofDrafts, "proof drafts");
    if (Object.keys(raw.proofDrafts).length > 500)
      fail("Too many proof drafts.");
    for (const [key, value] of Object.entries(raw.proofDrafts))
      proofDrafts[id(key, "proof draft id")] = text(
        value,
        "proof draft",
        50000,
      );
  }
  // Older backups name the reviewed attempt only while its submitted proof is unedited.
  const reviewAttemptId = nullableId(
    raw.reviewAttemptId ?? raw.proofAttemptId,
    "reviewed attempt id",
  );
  return {
    mode: "full",
    modelReviews: raw.modelReviews === undefined ? null : validateModelReviews(raw.modelReviews),
    history,
    reviews,
    session: active,
    proofDraft,
    proofId,
    reviewQuestion,
    proofDrafts,
    proofAttemptId: nullableId(raw.proofAttemptId, "proof attempt id"),
    reviewAttemptId: reviewQuestion ? reviewAttemptId : null,
    bookmarks:
      raw.bookmarks == null
        ? []
        : list(raw.bookmarks, "bookmarks", 500).map((x) =>
            id(x, "bookmark id"),
          ),
  };
}
