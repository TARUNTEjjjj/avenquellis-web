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
