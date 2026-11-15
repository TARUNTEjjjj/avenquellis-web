import test from "node:test";
import assert from "node:assert/strict";
import {
  initExactMath,
  checkExact,
  evaluateExact,
} from "../dist/math/exact-math.js";
import {
  configureExactChecker,
  makeSession,
  finishSession,
} from "../dist/lib/session.js";
import { auditArithmetic } from "../dist/lib/arithmetic-audit.js";
await initExactMath();
test("shipped C++ module grades arithmetic expressions exactly through the test runner", () => {
  configureExactChecker(checkExact);
  try {
    const q = {
      id: "n",
      title: "Exact result",
      statement: "Find one.",
      type: "numeric",
      topic: "algebra",
      answer: "1",
      maxMarks: 4,
    };
    const s = makeSession(
      {
        id: "compiled-test",
        title: "Compiled test",
        durationMinutes: 5,
        questions: [q],
      },
      1000,
    );
    s.answers.n = "9007199254740993 - 9007199254740992";
    const r = finishSession(s, 2000).results[0];
    assert.equal(r.score, 4);
    assert.equal(r.checker, "axiom-cpp-wasm");
    assert.equal(r.normalizedAnswer, "1");
    q.answer = "1/3";
    s.answers.n = "0.3333333333333333";
    assert.equal(finishSession(s, 2000).results[0].score, 0);
    q.answer = "invalid key";
    assert.equal(finishSession(s, 2000).results[0].score, null);
  } finally {
    configureExactChecker(null);
  }
});
test("proof arithmetic flags contradictions while leaving logical claims unjudged", () => {
  const report = auditArithmetic(
    "0.1+0.2=0.3\n1/2=2/3\nx+x=2*x\n1/0=0",
    checkExact,
  );
  assert.equal(report.checked, 2);
  assert.equal(report.contradictions, 1);
  assert.deepEqual(
    report.claims.map((c) => c.status),
    ["verified", "contradiction", "unsupported"],
  );
  assert.equal(report.score, undefined);
  assert.equal(evaluateExact("(1/3+1/6)*4").value, "2");
});

import { questionBank } from "../dist/lib/questions.js";
import { validateBackup } from "../dist/lib/backup.js";
import { certificateHelp } from "../dist/lib/certificate.js";
test("complete structured proof earns marks, partial proof remains pending, imported marks recompute", () => {
  const q = questionBank.find((q) => q.templateId === "number-gcd");
  const s = makeSession(
    {
      id: "certificate-test",
      title: "Certificate test",
      durationMinutes: 20,
      questions: [q],
    },
    1000,
  );
  const full = certificateHelp(q)
    .scaffold.replace("forward: _ _", "forward: -1 1")
    .replace("reverse: _ _", "reverse: 1 1")
    .replace(
      "conclusion: _",
      "conclusion: same-positive-divisors -> equal-maxima",
    );
  s.answers[q.id] = full;
  const done = finishSession(s, 2000);
  assert.equal(done.results[0].score, 10);
  assert.equal(done.results[0].status, "verified_certificate");
  s.answers[q.id] = full.replace("reverse: 1 1", "reverse: 1 2");
  const partial = finishSession(s, 2000);
  assert.equal(partial.results[0].score, null);
  assert.equal(partial.results[0].certificate.lowerBoundPoints, 4);
  const backup = {
    schema: "noether-backup-v1",
    history: [done],
    reviews: [],
    session: null,
  };
  done.results[0].score = 999;
  assert.equal(validateBackup(backup).history[0].results[0].score, 10);
  s.answers[q.id] =
    "The sets of common positive divisors are equal in both directions.";
  assert.equal(finishSession(s, 2000).results[0].score, null);
});

import { regradeAttempt } from "../dist/lib/session.js";
import { summarizeProgress, pendingReviews } from "../dist/lib/progress.js";
test("an answer beyond the C++ engine's bounds is labelled too large to check: it scores no zero and is not left pending", () => {
  const q = questionBank.find((q) => q.templateId === "geometry-inradius");
  assert.equal(String(q.answer), "4");
  const grade = (answer) => {
    const s = makeSession(
      { id: "bounds", title: "Bounds", durationMinutes: 5, questions: [q] },
      1000,
    );
    s.answers[q.id] = answer;
    return finishSession(s, 2000);
  };
  configureExactChecker(checkExact);
  try {
    // Each bound of the engine, reached by an answer whose value is 4.
    for (const answer of [
      "4" + " ".repeat(4096) + "*1", // 4096 bytes
      "4" + "+0".repeat(600), // 1024 tokens
      "(".repeat(65) + "4" + ")".repeat(65), // 64 nesting levels
      "4." + "0".repeat(63), // 64-character literal
      "40000000000000000000/10000000000000000000", // 19 integer digits
      "4.0000000000000000000", // 18 fractional digits
      "9223372036854775808/2305843009213693952", // literal beyond 64 bits
      "4*9000000000000000000/9000000000000000000", // 64-bit numerator
      "1/3037000500/3037000500*3037000500*3037000500*4", // 64-bit denominator
    ]) {
      const attempt = grade(answer), r = attempt.results[0];
      assert.equal(r.status, "beyond_checker_bounds", answer.slice(0, 48));
      assert.equal(r.score, null);
      assert.match(r.diagnostic, /exceeds/);
      // No checker can decide it and a numeric answer has no review, so it must not count as awaiting one.
      assert.equal(pendingReviews(attempt, []), 0);
    }
    // A wrong answer beyond a bound gets the same label instead of waiting for a check that cannot come.
    assert.equal(grade("99999999999999999999").results[0].status, "beyond_checker_bounds");
    // Malformed and undefined answers are still wrong, and a correct one in bounds still earns its marks.
    for (const answer of ["2abc", "(4", ".", "x", "4/0", "1e3", "4\u00004"]) {
      const r = grade(answer).results[0];
      assert.equal(r.status, "auto_checked", answer);
      assert.equal(r.score, 0);
    }
    assert.equal(grade("(1/3 + 1/6) * 8").results[0].score, q.maxMarks);
    // An attempt the previous release scored 0 for such an answer is relabelled by the startup re-grade,
    // so first-attempt accuracy no longer counts it as wrong.
    const saved = grade("4.0000000000000000000");
    saved.results = [{ ...saved.results[0], score: 0, status: "auto_checked", checker: "axiom-cpp-wasm" }];
    const regraded = regradeAttempt(saved, () => null);
    assert.equal(regraded.results[0].status, "beyond_checker_bounds");
    assert.equal(regraded.results[0].score, null);
    assert.equal(pendingReviews(regraded, []), 0);
    assert.equal(summarizeProgress([regraded], [], ["geometry"]).attempted, 0);
  } finally {
    configureExactChecker(null);
  }
});
