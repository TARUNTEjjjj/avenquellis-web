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
export function checkNumericResponse(value, expected) {
  const answer = String(value ?? "").trim();
  if (!answer) return { ok: true, equivalent: false, checker: "blank" };
  if (compiledChecker) {
    try {
      const result = compiledChecker(answer, String(expected));
      if (
        !result ||
        typeof result.ok !== "boolean" ||
        (result.ok && typeof result.equivalent !== "boolean") ||
        result.code === "engine_unavailable" ||
        result.unavailable ||
        (!result.ok && result.side !== "left")
      )
        return {
          ...result,
          ok: false,
          unavailable: true,
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
export function makeSession(mock, now = Date.now()) {
  return {
    ...mock,
    attemptId: `attempt-${now}-${Math.random().toString(36).slice(2, 8)}`,
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
              ? "checker_unavailable"
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
