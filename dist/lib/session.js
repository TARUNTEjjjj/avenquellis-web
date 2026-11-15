import { verifyCertificate } from "./certificate.js";
import { compareExactLiterals } from "./exact-rational.js";
let checkCertificate=verifyCertificate;
export function configureProofChecker(checker){checkCertificate=checker;}
let compiledChecker = null;
export function configureExactChecker(checker) {
  if (checker !== null && typeof checker !== "function")
    throw new TypeError("Expected a checker function.");
  compiledChecker = checker;
}
// Both checkers report their own bounds (input size, tokens, nesting, literal digits, 64-bit values) as a failure of
// the answer, the same way as malformed input. Every bound's message says "exceeds"; malformed input and division by
// zero never do. A correct answer can pass a bound, so such a failure is not marked wrong. No checker can decide
// it either, so it is not left pending: the result says `beyondBounds`, and the report labels it.
const beyondBounds = (result) => /\bexceeds\b/.test(String(result?.error ?? ""));
export function checkNumericResponse(value, expected) {
  const answer = String(value ?? "").trim();
  if (!answer) return { ok: true, equivalent: false, checker: "blank" };
  if (compiledChecker) {
    try {
      const result = compiledChecker(answer, String(expected));
      const undecided =
        !result ||
        typeof result.ok !== "boolean" ||
        (result.ok && typeof result.equivalent !== "boolean") ||
        result.code === "engine_unavailable" ||
        result.unavailable ||
        (!result.ok && result.side !== "left");
      if (undecided || (!result.ok && beyondBounds(result)))
        return {
          ...result,
          ok: false,
          unavailable: true,
          ...(undecided ? {} : { beyondBounds: true }),
          checker: "unavailable",
          error:
            result?.error || "The exact checker returned an invalid result.",
        };
      return { ...result, checker: "axiom-cpp-wasm" };
    } catch {
      return {
        ok: false,
        unavailable: true,
        error: "The C++ checker did not complete.",
        checker: "unavailable",
      };
    }
  }
  const result = compareExactLiterals(answer, expected);
  if (!result.ok && result.side === "right")
    return { ...result, unavailable: true, checker: "unavailable" };
  if (!result.ok && beyondBounds(result))
    return { ...result, unavailable: true, beyondBounds: true, checker: "unavailable" };
  if (
    !result.ok &&
    /^[\d\s.+\-*/()]+$/.test(answer) &&
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*\/\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+))?$/.test(
      answer,
    )
  )
    return { ...result, unavailable: true, checker: "unavailable" };
  return { ...result, checker: "exact-literal-fallback" };
}
export function parseNumber(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const m = s.match(
    /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\s*\/\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)))?$/,
  );
  if (!m) return null;
  const n = Number(m[1]),
    d = m[2] === undefined ? 1 : Number(m[2]);
  return d && Number.isFinite(n / d) ? n / d : null;
}
export function gradeNumeric(value, expected) {
  const result = checkNumericResponse(value, expected);
  return result.ok === true && result.equivalent === true;
}
export function remainingSeconds(session, now = Date.now()) {
  return Math.max(0, Math.ceil((session.deadline - now) / 1000));
}
/** A new attempt id that none of the `taken` ids uses. */
export function newAttemptId(now = Date.now(), taken = []) {
  const used = new Set(taken);
  let id;
  do id = `attempt-${now}-${Math.random().toString(36).slice(2, 8)}`;
  while (used.has(id));
  return id;
}
/**
 * Give every saved attempt its own id. The previous release could finish a restored draft of an attempt
 * it had already saved, so two attempts shared one id. The oldest (listed last) keeps it; each newer copy
 * gets a derived id, the same in every tab, within the 200 characters a backup id allows.
 */
export function distinctAttempts(history) {
  const ids = history.map((a) => a?.attemptId);
  if (new Set(ids).size === ids.length) return history;
  const taken = new Set(ids),
    seen = new Set(),
    result = [...history];
  for (let i = result.length - 1; i >= 0; i--) {
    const id = ids[i];
    if (typeof id !== "string" || !seen.has(id)) {
      seen.add(id);
      continue;
    }
    let n = 2,
      next;
    do {
      const suffix = `-${n++}`;
      next = id.slice(0, 200 - suffix.length) + suffix;
    } while (taken.has(next));
    taken.add(next);
    result[i] = { ...result[i], attemptId: next };
  }
  return result;
}
export function makeSession(mock, now = Date.now()) {
  return {
    ...mock,
    attemptId: newAttemptId(now),
    startedAt: now,
    deadline: now + mock.durationMinutes * 60000,
    answers: {},
    flags: {},
    current: 0,
    status: "active",
  };
}
export function finishSession(session, now = Date.now(), grader=checkCertificate) {
  const { results: previousResults, submittedAt, ...submission } = session;
  return {
    ...structuredClone(submission),
    status: "completed",
    finishedAt: now,
    results: session.questions.map((q) => {
      const check =
        q.type === "numeric"
          ? checkNumericResponse(session.answers[q.id], q.answer)
          : null;
      // Only an exact, complete certificate on its own matching authored problem is gradable here.
      const assessment=q.type==="proof"?grader(q,session.answers[q.id]||""):null;
      const certificate=assessment && (assessment.complete===true || assessment.lowerBoundPoints!=null)?assessment:null;
      return {
        id: q.id,
        type: q.type,
        topic: q.topic,
        maxMarks: q.maxMarks,
        answer: session.answers[q.id] || "",
        score:
          q.type === "numeric" && !check.unavailable
            ? check.ok && check.equivalent
              ? q.maxMarks
              : 0
            : (certificate?.score ?? null),
        ...(certificate ? { certificate } : {}),
        status:
          q.type === "numeric"
            ? check.unavailable
              ? check.beyondBounds
                ? "beyond_checker_bounds"
                : "checker_unavailable"
              : "auto_checked"
            : certificate?.complete
              ? "verified_certificate"
              : "needs_review",
        ...(check
          ? {
              checker: check.checker,
              diagnostic: check.error ?? null,
              normalizedAnswer: check.left ?? null,
            }
          : {}),
      };
    }),
  };
}
/** Re-derive a saved attempt. While the proof checker cannot run, each saved proof result is kept as it was. */
export function regradeAttempt(attempt, proofChecker) {
  const saved = new Map(
    (Array.isArray(attempt.results) ? attempt.results : []).map((r) => [r?.id, r]),
  );
  return finishSession(attempt, attempt.finishedAt, (question, answer) => {
    try {
      return proofChecker(question, answer);
    } catch {
      return saved.get(question.id)?.certificate ?? null;
    }
  });
}
/** The time to record for a submission. The wall clock can step back during a test; a submission never precedes its start. */
export function submissionTime(session, now = Date.now()) {
  return Number.isSafeInteger(session?.startedAt) && session.startedAt > now
    ? session.startedAt
    : now;
}
/**
 * The title of a retried test. Earlier releases restore test titles of up to 500 characters, so a chain of
 * retries stops lengthening the title there.
 */
export function retryTitle(title) {
  const next = `${title} · retry`;
  return next.length <= 500 ? next : title;
}
/** Repair times saved after the clock stepped back, so the attempt stays valid. Ordered times are returned unchanged. */
export function orderTimes(s) {
  if (!s || typeof s !== "object" || !Number.isSafeInteger(s.startedAt)) return s;
  const early = (time) => Number.isFinite(time) && time < s.startedAt;
  if (!early(s.submittedAt) && !early(s.finishedAt)) return s;
  const ordered = { ...s };
  if (early(s.submittedAt)) ordered.submittedAt = s.startedAt;
  if (early(s.finishedAt)) ordered.finishedAt = s.startedAt;
  return ordered;
}
export function validSession(s) {
  return (
    !!s &&
    s.status === "active" &&
    Array.isArray(s.questions) &&
    s.questions.length > 0 &&
    s.questions.length <= 60 &&
    s.questions.every(
      (q) => q && typeof q.id === "string" && typeof q.statement === "string",
    ) &&
    Number.isFinite(s.deadline) &&
    (s.submittedAt == null || (Number.isSafeInteger(s.submittedAt) && s.submittedAt >= s.startedAt)) &&
    Number.isInteger(s.current) &&
    s.current >= 0 &&
    s.current < s.questions.length &&
    s.answers &&
    typeof s.answers === "object" &&
    s.flags &&
    typeof s.flags === "object"
  );
}
