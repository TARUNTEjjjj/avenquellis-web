import {generateOnServer, assessForPractice} from "./backend.js";
import {preloadNativeGrader} from "./lib/native-grader.js";
import {mountHandwriting} from "./handwriting.js";
import {benchmarkReport} from "./benchmark-report.js";
import {modelPanel,bindModelPanel,showModelReport,storedModelReviews,modelReviewRecords,replaceModelReviews} from "./model-review.js";
import {
  topics,
  topicLabels,
  questionBank,
  engineInfo,
} from "./lib/questions.js";
import { finalizeReview, gradingSources } from "./lib/grader.js";
import {
  makeSession,
  finishSession,
  remainingSeconds,
  validSession,
  configureExactChecker,
  configureProofChecker,
} from "./lib/session.js";
import { validateBackup } from "./lib/backup.js";
import { saveWorkspace } from "./lib/workspace-storage.js";
import { mountOrbit, stopOrbit } from "./orbit.js";
import { mathLabView, bindMathLab } from "./math-lab.js";
import { libraryView, bindLibrary } from "./question-library.js";
import { auditArithmetic } from "./lib/arithmetic-audit.js";
import { compareExactLiterals } from "./lib/exact-rational.js";
import { summarizeProgress } from "./lib/progress.js";
import { loadWorkspaceResources, bufferEvents } from "./lib/startup.js";
import {
  certificateGuide,
  bindCertificateGuide,
  certificateExamples,
  certificateResult,
} from "./certificate-ui.js";
// register-offline.js reports on window load, which does not wait for the top-level
// await below. Hold its notices until the workspace can show them.
const offlineNotices = bufferEvents(window, [
  "avenquellis:offline-ready",
  "avenquellis:offline-update-ready",
]);
// Load independent optional resources together. Slow requests must not hide the
// workspace indefinitely; existing literal, hosted-checker and catalog fallbacks remain usable.
const [mathApi, nativeGrader, loadedArchive] = await loadWorkspaceResources({
  loadMath: async () => {
    const api = await import("./math/exact-math.js");
    await api.initExactMath();
    return api;
  },
  loadGrader: preloadNativeGrader,
});
const mathReady = !!mathApi;
if (mathReady) configureExactChecker(mathApi.checkExact);

const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
// Restore historical work with the same compiled proof checker used by the live service.
const nativeCertificate=(question,answer)=>{
  let result;
  try {result=nativeGrader?.assess(question,answer);} catch {return null;}
  return result && ["verified_certificate","incomplete_certificate"].includes(result.status)?result:null;
};
configureProofChecker(nativeCertificate);
const KEY = "avenquellis.workspace.v1";
let storageOK = true;
function read() {
  try {
    return JSON.parse((localStorage.getItem(KEY) ?? localStorage.getItem("noether.v1"))) || {};
  } catch {
    storageOK = false;
    return {};
  }
}
const saved = read();
if (mathReady && Array.isArray(saved.history))
  saved.history = saved.history.map((a) =>
    validSession({ ...a, status: "active" }) && Number.isFinite(a.finishedAt)
      ? finishSession(a, a.finishedAt)
      : a,
  );
let bookmarks = Array.isArray(saved.bookmarks)
  ? saved.bookmarks.filter((id) => typeof id === "string").slice(0, 500)
  : [];
let bankFilters = {
  topic: "all",
  level: "all",
  type: "all",
  search: "",
  saved: false,
};
let history = Array.isArray(saved.history) ? saved.history : [],
  reviews = Array.isArray(saved.reviews) ? saved.reviews : [],
  session = validSession(saved.session) ? saved.session : null,
  proofDraft = typeof saved.proofDraft === "string" ? saved.proofDraft : "",
  proofId = saved.proofId || questionBank.find((q) => q.type === "proof").id,
  paused = !!saved.paused;
const archive = loadedArchive || { papers: [], questionReferences: [], sources: [] },
  archiveError = !loadedArchive;
const archiveBadge = document.querySelector("#nav .nav-tag");
if (archiveBadge) archiveBadge.textContent = String(archive.papers.length);
let page = "",
  examFilter = "all",
  chapter = "all",
  generated = null,
  generatedMock = null,
  currentProof = null,
  proofResult = null,
  reviewQuestion =
    saved.reviewQuestion && Array.isArray(saved.reviewQuestion.rubric)
      ? saved.reviewQuestion
      : null,
  proofDrafts =
    saved.proofDrafts && typeof saved.proofDrafts === "object"
      ? saved.proofDrafts
      : {},
  activeReport = null,
  proofAttemptId = saved.proofAttemptId || null,
  // The attempt whose submitted proof is open. Unlike proofAttemptId, editing keeps it.
  reviewAttemptId = reviewQuestion ? (saved.reviewAttemptId ?? proofAttemptId) : null,
  search = "",
  toastTimer;
const symbols = {
  algebra: "𝑥²",
  "number-theory": "ℤ",
  combinatorics: "ⁿCᵣ",
  geometry: "△",
  calculus: "∫",
  probability: "ℙ",
};
const pageNames = {
  overview: "Overview",
  tests: "Test arena",
  chapters: "Chapter library",
  bank: "Problem collection",
  arithmetic: "Exact math lab",
  generator: "Question forge",
  proof: "Proof studio",
  progress: "Your progress",
  sources: "Sources & methods",
  session: "Test in progress",
  report: "Session review",
};
// The open problem, taken from saved state rather than the last proof-studio render.
const proofQuestion = () =>
  reviewQuestion ||
  questionBank.find((q) => q.id === proofId) ||
  questionBank.find((q) => q.type === "proof");
// Text opened from a submitted attempt has its own slot, so it never replaces the separate draft for that problem.
const draftSlot = () =>
  reviewQuestion && reviewAttemptId
    ? `${reviewAttemptId}:${reviewQuestion.id}`
    : proofQuestion().id;
function persist() {
  try {
    const recent = history.slice(0, 100);
    const kept = saveWorkspace(localStorage, KEY, {
      history: recent,
      reviews: reviews.slice(0, 100),
      session,
      proofDraft,
      proofId,
      paused,
      reviewQuestion,
      proofDrafts,
      proofAttemptId,
      reviewAttemptId,
      bookmarks,
    });
    storageOK = true;
    if (kept < recent.length) {
      // Storage was full, so the oldest completed sessions made room for current work.
      // Show this after any message from the action that saved, which would replace it.
      const removed = recent.length - kept;
      history = history.slice(0, kept);
      setTimeout(() =>
        toast(
          `Browser storage is full, so ${removed === 1 ? "the oldest completed session was" : `the ${removed} oldest completed sessions were`} removed from this device to make room.`,
        ),
      );
    }
  } catch {
    storageOK = false;
  }
  const status = $(".local-status");
  if (status)
    status.innerHTML = `<i></i> ${storageOK ? "Saved on this device" : "Storage unavailable · export your work"}`;
}
function toast(s) {
  $("#toast").textContent = s;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3500);
}
function go(p) {
  if (location.hash === `#${p}`) render();
  else location.hash = p;
}
function heading(title, sub, extra = "") {
  return `<div class="heading-row"><div><h1>${title}</h1><p class="subtitle">${sub}</p></div>${extra}</div>`;
}
function topicOptions(all = true) {
  return `${all ? '<option value="all">All chapters</option>' : ""}${topics.map((t) => `<option value="${t}">${topicLabels[t]}</option>`).join("")}`;
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const draftWords = () =>
  plural(proofDraft.trim() ? proofDraft.trim().split(/\s+/).length : 0, "word", "words");
function badge(s, c = "") {
  return `<span class="badge ${c}">${esc(s)}</span>`;
}
function topicCards() {
  return topics
    .map(
      (t) =>
        `<button class="topic-item" data-topic="${t}"><span class="topic-symbol">${symbols[t]}</span><span><strong>${topicLabels[t]}</strong><small>${archive.questionReferences.filter((r) => r.topic === t).length} archive references</small></span><span class="right">↗</span></button>`,
    )
    .join("");
}
function overview() {
  return (
    heading(
      "A little curiosity. A lot of possibility.",
      "Your next mathematical breakthrough starts here.",
      `<span class="date-chip">✦ &nbsp; CMI · ISI · OLYMPIADS</span>`,
    ) +
    `<section class="hero hero-interactive"><div class="hero-copy"><div class="hero-label"><span class="live-dot"></span> A SPACE FOR MATHEMATICAL MINDS</div><h2>Don’t just solve it.<br><em>Understand why.</em></h2><p>Explore beautiful problems. Build rigorous proofs.<br>Your preparation for CMI, ISI and olympiads,<br>reimagined as a mathematics lab.</p><div class="button-group"><button class="button" data-go="${session ? "session" : "tests"}">${session ? "Resume your test" : "Enter the test arena"} <span>↗</span></button><button class="button secondary" data-go="generator">Explore the forge &nbsp; ✧</button></div><div class="hero-foot"><span>Class XII & beyond</span><span>Proof-first practice</span><span>Your pace</span></div></div><figure class="surface-lab" data-surface-lab>
      <div class="surface-switcher" role="group" aria-label="Choose a mathematical surface">
        <button type="button" data-surface="torus" aria-pressed="true">Torus</button>
        <button type="button" data-surface="mobius" aria-pressed="false">Möbius strip</button>
        <button type="button" data-surface="saddle" aria-pressed="false">Saddle</button>
      </div>
      <canvas id="orbit" role="img" tabindex="0" aria-label="Interactive torus. Drag or use arrow keys to rotate." aria-describedby="surface-controls surface-formula"></canvas>
      <figcaption><div aria-live="polite"><strong data-surface-name>Torus</strong><span id="surface-formula" data-surface-equation>(√(x² + y²) − 1)² + z² = 0.36²</span></div><small id="surface-controls">Drag or use arrow keys to rotate · Home resets view</small></figcaption>
    </figure></section><div class="engine-status"><span class="live-dot"></span><span>${mathReady ? "AxiomMath C++ is running in your browser. Exact answers, without rounding." : "Exact fraction checking is available. The C++ expression engine could not load."}</span><a href="#arithmetic">Open exact math lab ↗</a></div><div class="stats"><div class="stat"><span class="stat-icon">▤</span><div><strong>${archive.papers.length}</strong><small>Official papers & samples</small></div></div><div class="stat"><span class="stat-icon">✧</span><div><strong>${engineInfo.templateCount}</strong><small>Original question families</small></div></div><div class="stat"><span class="stat-icon">▦</span><div><strong>6</strong><small>Core mathematics chapters</small></div></div><div class="stat"><span class="stat-icon">↗</span><div><strong>${history.length.toString().padStart(2, "0")}</strong><small>Sessions completed by you</small></div></div></div><div class="section-heading"><h2>Choose your challenge</h2><a class="text-link" href="#tests">Explore test arena &nbsp; ↗</a></div><div class="grid3">${[
      [
        "CMI",
        "∞",
        "mint",
        "Creative thinking. Rigorous reasoning.",
        "Algebra · Calculus · Geometry",
      ],
      [
        "ISI",
        "∑",
        "purple",
        "Find the structure beneath the numbers.",
        "Number theory · Probability · Algebra",
      ],
      [
        "RMO",
        "△",
        "blue",
        "Where an elegant proof changes everything.",
        "Geometry · Combinatorics · Number theory",
      ],
    ]
      .map(
        ([exam, sym, c, desc, meta]) =>
          `<article class="card exam-card" style="--accent:${c === "purple" ? "#ae96fa" : c === "blue" ? "#7ba7ee" : "#8aefd0"}"><div class="card-head"><span class="exam-symbol ${c}">${sym}</span>${badge(exam === "RMO" ? "OLYMPIAD TRACK" : "ENTRANCE TRACK")}</div><h3>${exam === "RMO" ? "RMO & olympiads" : exam + " preparation"}</h3><p>${desc}</p><div class="card-meta">${meta}</div><div class="card-footer"><span>Original practice + official sources</span><button class="arrow-button" data-exam="${exam}" aria-label="Explore ${exam} tests">↗</button></div></article>`,
      )
      .join(
        "",
      )}</div><div class="lower-grid"><section><div class="section-heading" style="margin-top:0"><h2>One chapter. Deeper understanding.</h2><a class="text-link" href="#chapters">View all ↗</a></div><div class="topic-list">${topicCards()}</div></section><section class="proof-card"><span class="eyebrow" style="color:#b9a7f9">∴ &nbsp; THE PROOF STUDIO</span><h3>The reasoning is the answer.</h3><p>Write your argument. Explore a clear marking rubric. Review each step with the care a proof deserves.</p><div class="proof-line">Assume. Construct. Justify. Conclude. &nbsp; □</div><button class="button violet" data-go="proof">Open proof studio <span>↗</span></button></section></div>`
  );
}
function tests() {
  const papers = archive.papers.filter(
    (p) =>
      (examFilter === "all" || p.exam === examFilter) &&
      p.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    heading(
      "The test arena.",
      "Train your intuition. Then put it to the test.",
      session
        ? '<button class="button" data-go="session">Resume active test ↗</button>'
        : "",
    ) +
    `<div class="grid3">${[
      ["CMI", 12, 180],
      ["ISI", 12, 180],
      ["RMO", 6, 180],
    ]
      .map(
        ([e, n, d]) =>
          `<article class="card"><div class="card-head">${badge("GENERATED PRACTICE", "mint")}<span class="muted">${e}</span></div><h3>${e} mixed practice</h3><p>${n} original questions · mixed difficulty<br>Worked solutions and proof rubrics after submission.</p><div class="card-footer"><span>${d} minutes · ${n * 10} practice marks</span><button class="button small" data-mock="${e}">Start practice ↗</button></div></article>`,
      )
      .join(
        "",
      )}</div><div class="notice">Practice sets use our own question mix and marks. For the exact paper structure, choose an official paper below. When you finish or time runs out, written proofs go to the C++ checker. You can request model feedback on your own wording after submission. Structured proofs in supported families can earn verified marks.</div><div class="section-heading"><h2>From the official archives</h2><span class="tiny">Verified 3 November 2026</span></div><div class="filters">${["all", "CMI", "ISI", "RMO"].map((e) => `<button class="filter ${examFilter === e ? "active" : ""}" aria-pressed="${examFilter === e}" data-filter="${e}">${e === "all" ? "All tracks" : e}</button>`).join("")}<input class="search-input" id="paper-search" aria-label="Search papers by year or title" placeholder="Search year or paper…" value="${esc(search)}"></div>${archiveError ? '<div class="notice warning">The archive could not load. Reload to try again.</div>' : ""}<div class="paper-grid">${papers.map((p) => `<article class="card paper-card">${badge(p.label)}<h3>${esc(p.title)}</h3><div class="card-meta"><span>${p.questionCount ?? "See PDF"} questions / groups</span><span>${p.durationMinutes ? p.durationMinutes + " min" : "Timing: see paper"}</span></div><p>${p.kind === "official-sample" ? "Official sample/model set, as labeled by ISI." : "Study from the institution’s original PDF."}</p><div class="button-group"><button class="button small secondary" data-paper="${p.id}">Timed companion ↗</button><a class="button small ghost" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">PDF ↗</a></div></article>`).join("") || '<div class="empty">No papers match this search.</div>'}</div>`
  );
}
function chapters() {
  const refs = archive.questionReferences.filter(
    (r) =>
      (chapter === "all" || r.topic === chapter) &&
      (examFilter === "all" || r.exam === examFilter),
  );
  return (
    heading(
      "Build depth, chapter by chapter.",
      "Original drills and a carefully indexed path through the official archives.",
    ) +
    `<div class="topic-list" style="grid-template-columns:repeat(auto-fit,minmax(175px,1fr))">${topicCards()}</div><div class="section-heading"><h2>${chapter === "all" ? "All chapter references" : topicLabels[chapter]}</h2><button class="text-link" id="chapter-drill">Generate a chapter drill ↗</button></div><div class="filters"><select id="chapter-select" style="width:auto" aria-label="Chapter">${topicOptions()}</select>${["all", "CMI", "ISI", "RMO"].map((e) => `<button class="filter ${examFilter === e ? "active" : ""}" aria-pressed="${examFilter === e}" data-filter="${e}">${e === "all" ? "All tracks" : e}</button>`).join("")}<button class="button small secondary" id="chapter-test">Start reference set (${Math.min(refs.length, 6)}) ↗</button></div><div class="notice">These entries identify questions in official PDFs. Open the source for the complete statement; the timed companion saves your working alongside each reference. Chapter tags are editorial classifications.</div><div class="card table-wrap"><table class="table"><thead><tr><th>QUESTION</th><th>CHAPTER</th><th>SOURCE</th><th>OPEN</th></tr></thead><tbody>${refs.map((r) => `<tr><td><strong>${esc(r.title)}</strong><br><span class="tiny">${esc(r.questionNumber)} · ${esc(r.type)}</span></td><td>${topicLabels[r.topic]}</td><td>${r.exam} ${r.year}<br><span class="tiny">${esc(r.sourceLabel)}</span></td><td><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">PDF ↗</a></td></tr>`).join("") || '<tr><td colspan="4">No verified references for this selection yet. Try another chapter or track.</td></tr>'}</tbody></table></div>`
  );
}
function generator() {
  return (
    heading(
      "The question forge.",
      "Change the parameters. Discover a new path to the proof.",
      badge("DETERMINISTIC ENGINE", "mint"),
    ) +
    `<section class="card form-card"><span class="eyebrow">CONFIGURE YOUR NEXT CHALLENGE</span><form id="generate-form"><div class="form-grid"><div><label for="gen-exam">Preparation track</label><select id="gen-exam"><option>CMI</option><option>ISI</option><option>RMO</option></select></div><div><label for="gen-topic">Chapter</label><select id="gen-topic">${topicOptions()}</select></div><div><label for="gen-difficulty">Difficulty preference</label><select id="gen-difficulty"><option value="advanced">Advanced</option><option value="foundation">Foundation</option><option value="olympiad">Olympiad</option></select></div><div><label for="gen-type">Answer format</label><select id="gen-type"><option value="all">Mixed format</option><option value="proof">Proof section</option><option value="numeric">Exact numeric section</option></select></div><div><label for="gen-seed">Seed · reproduce this exact set</label><input id="gen-seed" value="${Date.now().toString().slice(-6)}" maxlength="80" required></div><div><label for="gen-count">Mock size</label><select id="gen-count"><option value="6">6 questions · focused session</option><option value="12">12 questions · extended session</option><option value="18">18 questions · full practice</option></select></div><div><label>&nbsp;</label><div class="button-group"><button type="submit" class="button">Forge a question ✧</button><button type="button" class="button secondary" id="assemble">Build mock ↗</button></div></div></div></form><p class="tiny">${engineInfo.templateCount} authored template families with worked solutions. Seeds vary parameters; mathematical novelty and difficulty are not independently calibrated. A mock may mix levels to avoid repeated questions.</p></section><div id="forge-output">${generatedMock ? mockPreview(generatedMock) : generated ? questionPreview(generated) : '<div class="empty spacer"><strong>Every great proof begins with a question.</strong>Choose a chapter and forge your first problem.</div>'}</div>`
  );
}
function questionPreview(q) {
  return `<article class="question-box"><div class="question-top"><div>${badge(topicLabels[q.topic])}${badge(q.difficulty, "violet")}</div><span class="tiny">${q.maxMarks} marks · ${q.type}</span></div><h2 class="compact-heading">${esc(q.title)}</h2><div class="question-statement">${esc(q.statement)}</div><div class="button-group"><button class="button" id="try-generated">Solve this question ↗</button><button class="button secondary" id="save-question">Export question ↓</button>${q.type === "proof" ? '<button class="button ghost" id="proof-generated">Open in proof studio</button>' : ""}</div><details class="details"><summary>Worked solution & marking rubric</summary><div class="solution">${esc(q.solution)}</div>${rubric(q)}</details><p class="tagline">${esc(q.source.label)}</p></article>`;
}
function mockPreview(m) {
  return `<section class="question-box"><div class="question-top"><h2>${esc(m.title)}</h2>${badge("ORIGINAL PRACTICE", "mint")}</div><p class="subtitle">${m.questions.length} questions · ${m.durationMinutes} minutes · ${m.maxMarks} marks</p><div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>PROBLEM</th><th>CHAPTER / LEVEL</th><th>FORMAT</th></tr></thead><tbody>${m.questions.map((q, i) => `<tr><td>${i + 1}</td><td>${esc(q.title)}</td><td>${topicLabels[q.topic]} · ${q.difficulty}</td><td>${q.type}</td></tr>`).join("")}</tbody></table></div><div class="button-group spacer"><button class="button" id="start-generated-mock">Start this practice test ↗</button><button class="button secondary" id="export-mock">Export test + solutions ↓</button></div><p class="tagline">${esc(m.notice)}</p></section>`;
}
function rubric(q, inputs = false) {
  return q.rubric
    .map(
      (c) =>
        `<div class="rubric-row"><span>${esc(c.description)}</span>${inputs ? `<div class="score-field"><input aria-label="Points for ${esc(c.description)}" type="number" min="0" max="${c.points}" step="1" value="0" data-score="${esc(c.id)}"><span>/ ${c.points}</span></div>` : `<strong>${c.points} pts</strong>`}</div>`,
    )
    .join("");
}
function proof() {
  currentProof = proofQuestion();
  return (
    heading(
      "The proof studio.",
      "Give every logical step the attention it deserves.",
      badge("PROOF REVIEW", "violet"),
    ) +
    certificateExamples(questionBank) +
    `<div class="split spacer"><section><div class="card"><label for="proof-question">Choose an original proof problem</label><select id="proof-question">${reviewQuestion ? `<option value="custom">${esc(reviewQuestion.title)} · from your session</option>` : ""}${questionBank
      .filter((q) => q.type === "proof")
      .map(
        (q) =>
          `<option value="${q.id}" ${currentProof.id === q.id ? "selected" : ""}>${topicLabels[q.topic]} · ${esc(q.title)}</option>`,
      )
      .join(
        "",
      )}</select><div class="question-statement">${esc(currentProof.statement)}</div>${badge(currentProof.difficulty)} <span class="tiny">${currentProof.maxMarks} marks · original practice</span></div><div class="card spacer"><label for="proof-answer">Your argument</label><div class="math-toolbar" role="group" aria-label="Insert mathematics symbol">${["∀", "∃", "⇒", "⇔", "∈", "ℝ", "ℤ", "≤", "≥", "≠", "≡", "Σ", "√", "²", "□"].map((symbol) => `<button type="button" data-insert="${symbol}" aria-label="Insert ${symbol}">${symbol}</button>`).join("")}</div><textarea class="text-area" id="proof-answer" maxlength="50000" placeholder="Begin with what is given. State the claim, justify each step, and finish with your conclusion. Plain text and Unicode mathematics work here.">${esc(proofDraft)}</textarea>${certificateGuide(currentProof)}${modelPanel()}<div id="arithmetic-feedback"></div><div class="saved-text" id="proof-save">Draft saved on this device · ${draftWords()}</div><div class="button-group"><button class="button violet" id="assess">Prepare review ∴</button><button class="button secondary" id="audit-proof">Check arithmetic =</button><button class="button ghost" id="export-proof">Export submission ↓</button></div></div><div id="proof-feedback">${proofResult ? feedbackView(proofResult) : ""}</div></section><aside class="card rubric-card"><span class="eyebrow">WHAT A COMPLETE ARGUMENT NEEDS</span><h3 class="compact-heading">Problem-specific rubric</h3>${rubric(currentProof)}<div class="notice">The C++ checker verifies explicit arithmetic equalities. The structured certificate checker verifies witnesses for supported problems. A reviewer assesses free-form arguments against this rubric. Model readings give practice marks with excerpts from your own proof. Human assessments and verified certificate marks are shown separately.</div><details><summary>Reference solution</summary><div class="solution">${esc(currentProof.solution)}</div></details><p class="tiny spacer">Review methods draw on published IMO coordination and UKMT marking guidance. No institutional affiliation or endorsement.</p><a class="text-link" href="#sources">Read the grading method ↗</a></aside></div>`
  );
}
function feedbackView(result) {
  if (result.complete !== undefined && result.lowerBoundPoints !== undefined) return certificateResult(result);
  return `<section class="card spacer"><div class="card-head"><h3 style="margin:0">Ready for a careful review</h3>${badge("AWAITING HUMAN REVIEW", "violet")}</div><p>${plural(result.wordCount, "word", "words")} preserved. No automated correctness score has been assigned.</p><ul class="sources-list">${result.feedback.map((s) => `<li>${esc(s)}</li>`).join("")}</ul><details class="details"><summary>Record a human or self assessment</summary><p class="tiny spacer">Use the rubric against the complete argument. This records a local assessment; reviewer identity and expertise are not verified.</p><form id="review-form">${rubric(currentProof, true)}<div class="form-grid" style="grid-template-columns:1fr"><div><label for="reviewer">Reviewer name or “Self assessment”</label><input id="reviewer" required value="Self assessment"></div><div><label for="rationale">Reasoning behind the marks</label><textarea class="text-area" style="min-height:90px" id="rationale" required placeholder="Explain the valid steps, any gaps, and credit for alternative approaches."></textarea></div></div><button class="button secondary" type="submit">Save assessment</button></form></details></section>`;
}
function sources() {
  return (
    heading(
      "Clear sources. Honest methods.",
      "Know where each question comes from, and what a mark can mean.",
    ) +
    `<div class="split"><section class="card"><h2>Official question archives</h2><p>Original institution-hosted PDFs, with paper years and question references checked. Source questions remain in their official documents.</p><ul class="sources-list">${archive.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a></li>`).join("")}</ul><h3 class="compact-heading">How the catalog is organized</h3><p>${archive.papers.length} paper/sample records and ${archive.questionReferences.length} chapter references. ISI documents labeled “sample” remain samples. A timed companion is a writing workspace alongside the linked PDF, not a fully transcribed paper. Unknown official timings are left unspecified; you choose a practice timer.</p><h3>Original question generation</h3><p>${engineInfo.templateCount} template families vary parameters reproducibly. Their solutions and rubrics are authored with each template. Difficulty labels are estimates. Automated mathematical invariant tests cover selected families, not a guarantee of every future question.</p></section><section class="card"><h2>How proof review works</h2><p>One problem-specific rubric, a preserved submission, and explicit credit for each mathematical step. Alternative valid solutions must be considered by the reviewer.</p><ul class="sources-list">${gradingSources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><br><span class="tiny">${esc(s.adaptation)}</span></li>`).join("")}</ul><div class="notice warning">Model suggestions can differ from expert marks. Free-form proofs receive no automatic final mark. Two number-theory families also accept structured proofs: verified steps earn demonstrated credit and a fully checked certificate receives the problem’s practice marks. Hosted marking reads the same proof twice and quotes the student’s own words for each award of credit. An unresolved reading stays open for human review.</div><p>Self-assessments are labeled and reviewer names are unverified. No CMI/ISI professor or olympiad examiner is connected to this workspace. Two reviews from the same model can share mistakes; agreement is not an independent guarantee.</p></section></div>${benchmarkReport()}<section class="card spacer"><h3>Your workspace and your data</h3><p>Attempts, drafts and assessments are saved in this browser’s local storage. They are not synced across devices. Test and certificate checks use the loaded checker on this device. If that checker is unavailable, the answer is sent to the hosted checker on Cloudflare. Select Mark my proof to request two model readings. Transcribe photo sends the selected page to Cloudflare for transcription. You review the text before adding it to your answer. The optional local model downloads its weights and keeps your writing on your device. Export a practice review with its proof or attempt. Worked solutions are visible in the learning app.</p></section>`
  );
}
function progress() {
  const results = history.flatMap((a) => a.results || []),
    summary = summarizeProgress(history, reviews, topics),
    nums = Array.from({ length: summary.attempted }),
    correct = summary.correct;
  return (
    heading(
      "Small steps become real progress.",
      "Your completed sessions and review records, stored on this device.",
      '<button class="button secondary" id="export-backup">Export backup ↓</button>',
    ) +
    `<div class="stats"><div class="stat"><span class="stat-icon">▤</span><div><strong>${history.length}</strong><small>Completed sessions</small></div></div><div class="stat"><span class="stat-icon">✓</span><div><strong>${nums.length ? Math.round((correct / nums.length) * 100) + "%" : "—"}</strong><small>First-attempt numeric accuracy</small></div></div><div class="stat"><span class="stat-icon">∴</span><div><strong>${results.filter((r) => r.type !== "numeric").length}</strong><small>Proof / reference responses</small></div></div><div class="stat"><span class="stat-icon">✧</span><div><strong>${reviews.length}</strong><small>Recorded assessments</small></div></div></div><p class="tiny">Accuracy uses the first answered attempt at each distinct numeric question. Retries, blank responses, unavailable checks and proof marks are excluded. This is practice feedback, not an exam prediction.</p><div class="section-heading"><h2>Your chapter map</h2></div><div class="topic-progress">${summary.topics.map((t) => `<article><h3>${topicLabels[t.topic]}</h3><div class="progress-bar"><span style="width:${t.accuracy || 0}%"></span></div><small>${t.attempted ? `${t.correct} / ${t.attempted} first attempts correct` : "Ready for your first question"}</small></article>`).join("")}</div><div class="section-heading"><h2>Session history</h2></div>${history.length ? `<div class="card table-wrap"><table class="table"><thead><tr><th>SESSION</th><th>COMPLETED</th><th>RESPONSES</th><th>REVIEW</th></tr></thead><tbody>${history.map((a) => `<tr><td>${esc(a.title)}</td><td>${new Date(a.finishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td><td>${Object.values(a.answers).filter((x) => String(x).trim()).length} / ${a.questions.length}</td><td><button class="text-link" data-report="${a.attemptId}">View ↗</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty"><strong>Your story starts with the first attempt.</strong><p>Complete a practice session to see it here.</p><button class="button" data-go="tests">Find a challenge ↗</button></div>'}${reviews.length ? `<h2 class="compact-heading">Assessment records</h2><div class="stack">${reviews.map((r) => `<div class="card"><div class="question-top"><h3>${esc(r.questionTitle)}</h3>${badge(r.score + " / " + r.maxMarks, "mint")}</div><p>${esc(r.reviewer)} · identity unverified<br>${esc(r.rationale)}</p></div>`).join("")}</div>` : ""}<div class="card spacer"><h3>Restore a backup</h3><p>Import an Avenquellis backup or a backup exported under its previous name. Restored numeric results are recalculated; assessment records are treated as unverified local records.</p><input class="file-input" id="import-backup" type="file" accept="application/json,.json" aria-label="Import practice backup"></div>`
  );
}
function sessionView() {
  if (session && (completingSession === session || session.submittedAt != null)) {
    return heading("Checking your attempt…", storageOK
      ? "Your submitted work is saved. Checking will resume if you reopen this page."
      : "Keep this tab open while we check your submitted work. Browser storage is unavailable.");
  }
  if (!session)
    return (
      heading("No active test.", "Choose a challenge to get started.") +
      '<button class="button" data-go="tests">Open test arena ↗</button>'
    );
  const q = session.questions[session.current],
    answered = Object.values(session.answers).filter((a) =>
      String(a).trim(),
    ).length;
  return `<div class="session-top"><div><span class="eyebrow">${session.reference ? "OFFICIAL-PAPER COMPANION" : "ORIGINAL PRACTICE"}</span><h1>${esc(session.title)}</h1></div><div><label>TIME REMAINING</label><div class="timer" id="timer">${timeText(remainingSeconds(session))}</div></div></div><div class="session-layout"><section><article class="question-box"><div class="question-top"><div>${badge("QUESTION " + (session.current + 1))}${badge(topicLabels[q.topic] || "Official reference")}</div><span class="tiny">${q.maxMarks ?? "See paper"} marks · ${q.type}</span></div><h2 class="compact-heading">${esc(q.title)}</h2><div class="question-statement">${esc(q.statement)}</div>${q.source?.url ? `<a class="button secondary" href="${esc(q.source.url)}" target="_blank" rel="noopener noreferrer">Open official question ↗</a><p class="tiny spacer">Keep the official PDF open alongside this writing workspace.</p>` : ""}${q.type === "proof" ? certificateGuide(q) : ""}<label for="session-answer">${q.type === "numeric" ? "Your answer · exact number, fraction or expression" : "Your proof / working"}</label>${q.type === "numeric" ? `<input id="session-answer" inputmode="text" maxlength="4096" placeholder="e.g. (1/3 + 1/6) * 4" value="${esc(session.answers[q.id] || "")}">` : `<textarea class="text-area" id="session-answer" maxlength="50000" placeholder="Write your reasoning here…">${esc(session.answers[q.id] || "")}</textarea>`}<div class="saved-text" id="answer-saved">${storageOK ? "Saved locally. You can leave and resume." : "Storage unavailable. Keep this tab open and export your work."}</div><div class="session-actions"><button class="button ghost" id="previous" ${session.current === 0 ? "disabled" : ""}>← Previous</button><button class="button ghost" id="flag">${session.flags[q.id] ? "★ Flagged" : "☆ Flag for review"}</button><button class="button secondary" id="next" ${session.current === session.questions.length - 1 ? "disabled" : ""}>Next →</button></div></article></section><aside class="card"><h3>Your questions</h3><p class="tiny">${answered} of ${session.questions.length} answered</p><div class="progress-bar"><span style="width:${(answered / session.questions.length) * 100}%"></span></div><div class="question-nav">${session.questions.map((q, i) => `<button data-qindex="${i}" aria-label="Question ${i + 1}${session.answers[q.id]?.trim() ? ", answered" : ""}${session.flags[q.id] ? ", flagged" : ""}"${i === session.current ? ' aria-current="step"' : ""} class="${i === session.current ? "current" : ""} ${session.answers[q.id]?.trim() ? "answered" : ""} ${session.flags[q.id] ? "flagged" : ""}">${i + 1}</button>`).join("")}</div><p class="tiny">Green: answered<br>Amber underline: flagged</p><button class="button" id="submit-session" style="width:100%">Finish & review ↗</button><button class="text-link spacer" id="export-active">Export answers ↓</button></aside></div>`;
}
function timeText(n) {
  return `${Math.floor(n / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((n % 3600) / 60)
    .toString()
    .padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
}
function report() {
  const a = activeReport || history[0];
  if (!a)
    return heading(
      "No session to review.",
      "Finish a practice test to see your working here.",
    );
  const checked = a.results.filter(
      (r) =>
        (r.status === "auto_checked" || r.status === "verified_certificate") &&
        r.score !== null,
    ),
    earned = checked.reduce((s, r) => s + r.score, 0),
    max = checked.reduce((s, r) => s + r.maxMarks, 0),
    pending = a.results.filter((r) => (r.status === "needs_review" || r.status === "checker_unavailable") && !reviews.some((v) => v.attemptId === a.attemptId && v.questionId === r.id)).length;
  return (
    heading(
      "Look closer. Learn more.",
      esc(a.title),
      '<button class="button secondary" id="export-report">Export this attempt ↓</button>',
    ) +
    `<section class="card"><div class="question-top"><div><span class="eyebrow">AUTOMATICALLY CHECKED MARKS</span><div class="result-number">${max ? `${earned} <span class="muted" style="font-size:22px">/ ${max}</span>` : "—"}</div></div><div>${badge(`${plural(pending, "response needs", "responses need")} review`, "violet")}</div></div><p class="subtitle">This total includes numeric answers and fully verified structured proofs. Model marks for free-form proofs appear separately under each response. Official-paper responses require human review.</p><button class="button small ghost spacer" id="retry-session">Retry this set ↻</button></section>${a.questions
      .map((q, i) => {
        const r = a.results[i],
          record = reviews.find(
            (v) => v.attemptId === a.attemptId && v.questionId === q.id,
          );
        return `<article class="report-section"><div class="question-top"><h3>${i + 1}. ${esc(q.title)}</h3>${badge(r.type === "numeric" ? (r.status === "checker_unavailable" ? "Exact checker unavailable" : r.score ? "Correct" : "Incorrect / blank") : r.status === "verified_certificate" ? `Verified proof: ${r.score}/${r.maxMarks}` : record ? `Recorded review: ${record.score}/${record.maxMarks}` : "Needs human review", r.score ? "mint" : "")}</div><div class="question-statement" style="font-size:16px">${esc(q.statement)}</div>${record ? `<p class="tiny">${esc(record.reviewer)} · identity unverified · ${esc(record.rationale)}</p>` : ""}${r.checker ? `<p class="tiny">Checked by ${r.checker === "axiom-cpp-wasm" ? "AxiomMath C++ / WebAssembly" : r.checker === "exact-literal-fallback" ? "exact literal arithmetic" : esc(r.checker)}${r.diagnostic ? " · " + esc(r.diagnostic) : ""}</p>` : ""}${r.certificate ? certificateResult(r.certificate) : ""}<label>Your response</label><div class="solution">${esc(r.answer || "No response submitted.")}</div>${q.source?.url ? `<a class="text-link" href="${esc(q.source.url)}" target="_blank" rel="noopener noreferrer">View official source ↗</a>` : `<details class="details"><summary>Worked solution & rubric</summary><div class="solution">${esc(q.solution)}</div>${rubric(q)}</details>`}${q.type === "proof" ? `<div data-model-report="${i}"></div><button class="button small secondary spacer" data-review-q="${i}">Mark or review this proof ∴</button>` : ""}</article>`;
      })
      .join("")}`
  );
}
function render() {
  stopOrbit();
  page = (location.hash.slice(1) || "overview").split("?")[0];
  if (!Object.hasOwn(pageNames, page)) page = "overview";
  document.title = `${pageNames[page]} · Avenquellis`;
  $("#breadcrumb").textContent = pageNames[page];
  document
    .querySelectorAll("#nav a")
    .forEach((a) => a.classList.toggle("active", a.dataset.page === page));
  $(".sidebar").classList.remove("open");
  $(".mobile-menu").setAttribute("aria-expanded", "false");
  $("#main").innerHTML = {
    overview,
    tests,
    chapters,
    bank: () =>
      libraryView({
        questions: questionBank,
        topics,
        labels: topicLabels,
        filters: bankFilters,
        bookmarks,
      }),
    arithmetic: () => mathLabView(mathReady),
    generator,
    proof,
    progress,
    sources,
    session: sessionView,
    report,
  }[page]();
  bind();
  if (page === "overview") mountOrbit($("#orbit"), paused);
  if (page === "chapters") $("#chapter-select").value = chapter;
  persist();
}
function download(name, data) {
  if (data?.schema === "avenquellis-backup-v1")
    data = {
      ...data,
      modelReviews: modelReviewRecords(),
      history: data.history.slice(0, 100),
      reviews: data.reviews.slice(0, 100),
      proofDrafts: Object.fromEntries(
        Object.entries(data.proofDrafts || {}).slice(-500),
      ),
    };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function modal(content) {
  $("#modal-content").innerHTML = content;
  $("#modal-content .modal-title")?.setAttribute("id", "modal-heading");
  $("#modal").showModal();
}
function start(mock) {
  if (session?.submittedAt != null) {
    go("session");
    return;
  }
  if (session) {
    modal(
      `<h2 class="modal-title">Keep or replace your active test?</h2><p class="subtitle">${esc(session.title)} has saved work. Export it before starting a new test if you want to keep the draft.</p><div class="button-group spacer"><button class="button" id="keep-test">Resume existing</button><button class="button secondary" id="replace-test">Replace with new test</button><button class="button ghost" id="backup-active">Export draft ↓</button></div>`,
    );
    $("#keep-test").onclick = () => {
      $("#modal").close();
      go("session");
    };
    $("#backup-active").onclick = () =>
      download("avenquellis-active-draft.json", session);
    $("#replace-test").onclick = () => {
      $("#modal").close();
      session = null;
      start(mock);
    };
    return;
  }
  session = makeSession(mock);
  persist();
  go("session");
}
let completingSession = null;
async function complete() {
  if (!session || completingSession === session) return;
  const original = session;
  completingSession = original;
  session.submittedAt ??= Date.now();
  persist();
  const submitted = structuredClone(session);
  const finishedAt = submitted.submittedAt;
  if(page==="session"){
    const main=$("#main");
    main.replaceChildren(Object.assign(document.createElement("p"),{textContent:"Checking proofs and saving your attempt…"}));
  }
  const assessments=new Map();
  try {
    const proofs=submitted.questions.filter(q=>q.type==="proof" && submitted.answers[q.id]?.trim());
    for (let offset = 0; offset < proofs.length; offset += 2) {
      await Promise.all(proofs.slice(offset, offset + 2).map(async question => {
        const answer = submitted.answers[question.id];
        try { assessments.set(question.id, await assessForPractice(question, answer, nativeGrader)); }
        catch { assessments.set(question.id, nativeCertificate(question, answer)); }
      }));
    }
    if(session!==original)return;
    const result=finishSession(submitted,finishedAt,(q)=>assessments.get(q.id));
    history.unshift(result);
    history=history.slice(0,100);activeReport=result;session=null;
    persist();go("report");
  } finally {
    if (completingSession === original) completingSession = null;
  }
}
function referenceQuestion(r) {
  return {
    id: r.id,
    title: r.title,
    statement: `Open ${r.exam} ${r.year}, question ${r.questionNumber}, in the official PDF below. Write your answer and complete reasoning in this companion.`,
    topic: r.topic,
    type: "reference",
    maxMarks: r.maxMarks ?? null,
    source: { kind: r.sourceKind, label: r.sourceLabel, url: r.url },
  };
}
function paperSetup(id) {
  const p = archive.papers.find((p) => p.id === id);
  modal(
    `<h2 class="modal-title">${esc(p.title)}</h2><p class="subtitle">A timed writing companion to the official PDF. Answers are saved locally and require manual marking.</p><div class="notice">${esc(p.notes || "Read all instructions in the official paper before starting.")}</div><a class="button secondary" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Open official PDF ↗</a><form id="paper-setup"><div class="form-grid" style="grid-template-columns:1fr 1fr"><div><label for="paper-minutes">${p.durationMinutes ? "Timer (official duration prefilled)" : "Practice timer · official timing unverified"}</label><input id="paper-minutes" type="number" min="5" max="360" value="${p.durationMinutes || 180}" required></div><div><label for="paper-count">Response slots / question groups</label><input id="paper-count" type="number" min="1" max="60" value="${p.questionCount || 6}" required></div></div><button class="button" type="submit">Start companion ↗</button></form>`,
  );
  $("#paper-setup").onsubmit = (e) => {
    e.preventDefault();
    const count = Number($("#paper-count").value),
      minutes = Number($("#paper-minutes").value);
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > 60 ||
      minutes < 5 ||
      minutes > 360
    )
      return;
    const qs = Array.from({ length: count }, (_, i) => ({
      id: `${p.id}-slot-${i + 1}`,
      title: `Response slot ${i + 1}`,
      statement:
        "Use this slot for the corresponding question or question group in the PDF. Include the original section and question number in your response.",
      topic: "reference",
      type: "reference",
      maxMarks: null,
      source: { kind: p.kind, label: p.label, url: p.url },
    }));
    $("#modal").close();
    start({
      id: p.id,
      title: p.title,
      reference: true,
      durationMinutes: minutes,
      questions: qs,
      maxMarks: p.maxMarks,
    });
  };
}
function generateOptions() {
  return {
    exam: $("#gen-exam").value,
    topic: $("#gen-topic").value,
    difficulty: $("#gen-difficulty").value,
    seed: $("#gen-seed").value,
    type: $("#gen-exam").value === "RMO" ? "proof" : $("#gen-type").value,
    count: Number($("#gen-count").value),
  };
}
function bind() {
  if (page === "arithmetic")
    bindMathLab({
      evaluate:
        mathApi?.evaluateExact ||
        (() => ({ ok: false, error: "The compiled engine could not load." })),
      check: mathReady ? mathApi.checkExact : compareExactLiterals,
    });
  if (page === "bank")
    bindLibrary({
      filters: bankFilters,
      onChange: (f) => {
        bankFilters = f;
        render();
      },
      onBookmark: (id) => {
        bookmarks = bookmarks.includes(id)
          ? bookmarks.filter((x) => x !== id)
          : [...bookmarks, id].slice(-500);
        persist();
        render();
      },
      onPractice: (id) => {
        const q = questionBank.find((q) => q.id === id);
        start({
          id: "library-" + id,
          title: q.title,
          durationMinutes: 20,
          questions: [q],
          maxMarks: q.maxMarks,
        });
      },
      onExplore: (id) => {
        generated = questionBank.find((q) => q.id === id);
        generatedMock = null;
        go("generator");
      },
    });

  document
    .querySelectorAll("[data-go]")
    .forEach((e) => (e.onclick = () => go(e.dataset.go)));
  document.querySelectorAll("[data-exam]").forEach(
    (e) =>
      (e.onclick = () => {
        examFilter = e.dataset.exam;
        go("tests");
      }),
  );
  document.querySelectorAll("[data-topic]").forEach(
    (e) =>
      (e.onclick = () => {
        chapter = e.dataset.topic;
        go("chapters");
      }),
  );
  document.querySelectorAll("[data-filter]").forEach(
    (e) =>
      (e.onclick = () => {
        examFilter = e.dataset.filter;
        render();
      }),
  );
  document.querySelectorAll("[data-mock]").forEach(
    (e) =>
      (e.onclick = async () => {
        e.disabled=true;
        try {
          const exam = e.dataset.mock,
            m = await generateOnServer("mock",{
              exam,
              count: exam === "RMO" ? 6 : 12,
              seed: Date.now(),
            });
          m.durationMinutes = 180;
          if (e.isConnected) start(m);
        } catch (err) {
          toast(err.message);
        } finally {e.disabled=false;}
      }),
  );
  document
    .querySelectorAll("[data-paper]")
    .forEach((e) => (e.onclick = () => paperSetup(e.dataset.paper)));
  if (page === "tests")
    $("#paper-search").oninput = (e) => {
      const pos = e.target.selectionStart;
      search = e.target.value;
      render();
      $("#paper-search").focus();
      $("#paper-search").setSelectionRange(pos, pos);
    };
  if (page === "chapters") {
    $("#chapter-select").onchange = (e) => {
      chapter = e.target.value;
      render();
    };
    $("#chapter-drill").onclick = () => {
      go("generator");
      setTimeout(() => {
        if ($("#gen-topic")) $("#gen-topic").value = chapter;
      }, 0);
    };
    $("#chapter-test").onclick = () => {
      const refs = archive.questionReferences
        .filter(
          (r) =>
            (chapter === "all" || r.topic === chapter) &&
            (examFilter === "all" || r.exam === examFilter),
        )
        .slice(0, 6);
      if (!refs.length)
        return toast("Choose a chapter with available references.");
      start({
        id: "chapter-" + Date.now(),
        title:
          (topicLabels[chapter] || "Mixed chapter") + " · official references",
        reference: true,
        durationMinutes: refs.length * 20,
        questions: refs.map(referenceQuestion),
        maxMarks: null,
      });
    };
  }
  if (page === "generator") {
    $("#gen-exam").onchange = () => {
      const rmo = $("#gen-exam").value === "RMO";
      $("#gen-type").disabled = rmo;
      if (rmo) $("#gen-type").value = "proof";
      for (const option of $("#gen-topic").options)
        option.disabled =
          rmo && ["calculus", "probability"].includes(option.value);
      if (rmo && ["calculus", "probability"].includes($("#gen-topic").value))
        $("#gen-topic").value = "all";
    };
    let requestId=0;
    const createFromForm=async(single)=>{
      const form=$("#generate-form"), id=++requestId, options=generateOptions();
      const button=single?form.querySelector('[type=submit]'):$("#assemble");
      button.disabled=true;
      const slot=$("#forge-output");
      slot.textContent="Generating your practice material…";
      try {
        const mode=single?"question":options.topic==="all"?"mock":"chapter";
        if (single) delete options.count;
        const result=await generateOnServer(mode,options);
        if(!form.isConnected||id!==requestId)return;
        generated=single?result:null;generatedMock=single?null:result;
        slot.innerHTML=single?questionPreview(result):mockPreview(result);
        bindForge();
      } catch(error){if(id===requestId&&form.isConnected)slot.textContent=error.message;}
      finally{button.disabled=false;}
    };
    $("#generate-form").onsubmit = (event) => {event.preventDefault();void createFromForm(true);};
    $("#assemble").onclick = () => createFromForm(false);
    bindForge();
  }
  if (page === "proof") {
    bindModelPanel(currentProof,$("#proof-answer"));
    mountHandwriting($("#proof-answer"));
    let checkedCertificate = null;
    bindCertificateGuide(currentProof, $("#proof-answer"), {
      onCheck: (result) => {
        checkedCertificate = result;
      },
    });
    document
      .querySelectorAll("[data-certificate-example]")
      .forEach((button) => {
        button.onclick = () => {
          const select = $("#proof-question");
          select.value = button.dataset.certificateExample;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          const guide = $("[data-certificate-guide] details");
          if (guide) {
            guide.open = true;
            guide.scrollIntoView({ block: "nearest" });
          }
        };
      });
    document.querySelectorAll("[data-insert]").forEach(
      (button) =>
        (button.onclick = () => {
          const field = $("#proof-answer");
          const start = field.selectionStart,
            end = field.selectionEnd;
          field.setRangeText(button.dataset.insert, start, end, "end");
          field.dispatchEvent(new Event("input", { bubbles: true }));
          field.focus();
        }),
    );
    $("#audit-proof").onclick = () => {
      const result = auditArithmetic(
        proofDraft,
        mathReady ? mathApi.checkExact : compareExactLiterals,
      );
      $("#arithmetic-feedback").innerHTML =
        `<section class="notice ${result.contradictions ? "warning" : ""}"><strong>${result.checked} arithmetic ${result.checked === 1 ? "equality" : "equalities"} checked · ${result.contradictions} ${result.contradictions === 1 ? "contradiction" : "contradictions"}</strong>${result.claims.map((c) => `<div class="arithmetic-claim"><span class="${c.status === "verified" ? "pass" : c.status === "contradiction" ? "fail" : ""}">Line ${c.line} · ${esc(c.status)}</span><code>${esc(c.left)} = ${esc(c.right)}</code>${c.error ? `<span class="tiny">${esc(c.error)}</span>` : ""}</div>`).join("")}<p class="tiny spacer">${esc(result.notice)}</p></section>`;
    };
    $("#proof-question").onchange = (e) => {
      if (e.target.value === "custom") return;
      proofDrafts[draftSlot()] = proofDraft;
      proofId = e.target.value;
      reviewQuestion = null;
      reviewAttemptId = null;
      proofAttemptId = null;
      proofDraft = proofDrafts[proofId] || "";
      proofResult = null;
      persist();
      render();
    };
    $("#proof-answer").oninput = (e) => {
      proofDraft = e.target.value;
      proofAttemptId = null;
      proofDrafts[draftSlot()] = proofDraft;
      proofResult = null;
      $("#proof-feedback").innerHTML = "";
      $("#arithmetic-feedback").innerHTML = "";
      persist();
      $("#proof-save").textContent =
        `${storageOK ? "Draft saved" : "Storage unavailable"} · ${draftWords()}`;
    };
    $("#assess").onclick = async () => {
      const draft=proofDraft,question=currentProof,button=$("#assess");
      if (!proofDraft.trim())
        return toast("Write an argument before preparing a review.");
      try {
        button.disabled=true;
        const result=await assessForPractice(question,draft,nativeGrader);
        if(!result)throw Error("Connect to Avenquellis to check this proof.");
        if(!button.isConnected || draft!==proofDraft || question!==currentProof)return;
        proofResult={...result,wordCount:draft.trim().split(/\s+/u).length,feedback:result.feedback||[]};
        $("#proof-feedback").innerHTML = feedbackView(proofResult);
        bindReview();
        $("#proof-feedback").scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      } catch (err) {
        toast(err.message);
      } finally {button.disabled=false;}
    };
    $("#export-proof").onclick = async () => {
      const question = currentProof, answer = proofDraft, assessment = proofResult;
      const modelReviews = await storedModelReviews(question, answer);
      download("avenquellis-proof-submission.json", {
        question, answer, review: assessment,
        modelPracticeReview: modelReviews[0] ?? null,
        modelPracticeReviews: modelReviews,
        certificate: checkedCertificate,
      });
    };
    bindReview();
  }
  if (page === "session" && session && completingSession !== session && session.submittedAt == null) {
    bindCertificateGuide(
      session.questions[session.current],
      $("#session-answer"),
    );
    if (["proof","reference"].includes(session.questions[session.current].type)) mountHandwriting($("#session-answer"));
    $("#session-answer").oninput = (e) => {
      session.answers[session.questions[session.current].id] = e.target.value;
      persist();
      $("#answer-saved").textContent = storageOK
        ? "Answer saved on this device."
        : "Storage unavailable. Keep this tab open.";
    };
    $("#previous").onclick = () => {
      if (session.current > 0) {
        session.current--;
        persist();
        render();
      }
    };
    $("#next").onclick = () => {
      if (session.current < session.questions.length - 1) {
        session.current++;
        persist();
        render();
      }
    };
    $("#flag").onclick = () => {
      const id = session.questions[session.current].id;
      session.flags[id] = !session.flags[id];
      persist();
      render();
    };
    document.querySelectorAll("[data-qindex]").forEach(
      (e) =>
        (e.onclick = () => {
          session.current = Number(e.dataset.qindex);
          persist();
          render();
        }),
    );
    $("#export-active").onclick = () =>
      download("avenquellis-active-draft.json", session);
    $("#submit-session").onclick = () => {
      const blank = session.questions.filter(
        (q) => !session.answers[q.id]?.trim(),
      ).length;
      modal(
        `<h2 class="modal-title">Finish this attempt?</h2><p class="subtitle">${blank ? `${blank} response${blank === 1 ? " is" : "s are"} still blank. ` : ""}Your answers will be saved. Written proof answers go to Avenquellis’s C++ checker for certificate assessment. Prose awaits a separate review; no AI marking is requested by finishing a test.</p><div class="button-group spacer"><button class="button" id="confirm-finish">Finish & review</button><button class="button secondary" id="keep-writing">Keep writing</button></div>`,
      );
      $("#confirm-finish").onclick = () => {
        $("#modal").close();
        complete();
      };
      $("#keep-writing").onclick = () => $("#modal").close();
    };
  }
  if (page === "report") {
    const a = activeReport || history[0];
    if (a) {
      for (const slot of document.querySelectorAll("[data-model-report]")){const q=a.questions[Number(slot.dataset.modelReport)];void showModelReport(q,a.answers[q.id],slot);}
      $("#export-report").onclick = async () => {
        const pairs = await Promise.all(a.questions.map(async q => [q.id, await storedModelReviews(q, a.answers[q.id])]));
        const reviewed = pairs.filter(([, records]) => records.length);
        download("avenquellis-attempt.json", {...a,
          modelPracticeReviews: Object.fromEntries(reviewed.map(([id, records]) => [id, records[0]])),
          modelPracticeReviewsByQuestion: Object.fromEntries(reviewed),
        });
      };
      $("#retry-session").onclick = () =>
        start({
          id: a.id,
          title: a.title + " · retry",
          questions: a.questions,
          durationMinutes: a.durationMinutes,
          reference: a.reference,
          maxMarks: a.maxMarks,
        });
      document.querySelectorAll("[data-review-q]").forEach(
        (e) =>
          (e.onclick = () => {
            const i = Number(e.dataset.reviewQ);
            if (currentProof) proofDrafts[draftSlot()] = proofDraft;
            reviewQuestion = a.questions[i];
            proofAttemptId = a.attemptId;
            reviewAttemptId = a.attemptId;
            proofDraft = a.answers[reviewQuestion.id] || "";
            proofResult = null;
            go("proof");
          }),
      );
    }
  }
  if (page === "progress") {
    $("#export-backup").onclick = () =>
      download("avenquellis-backup.json", {
        schema: "avenquellis-backup-v1",
        exportedAt: new Date().toISOString(),
        history,
        reviews,
        session,
        proofDraft,
        proofId,
        reviewQuestion,
        proofDrafts,
        proofAttemptId,
        reviewAttemptId,
        bookmarks,
      });
    document.querySelectorAll("[data-report]").forEach(
      (e) =>
        (e.onclick = () => {
          activeReport = history.find((a) => a.attemptId === e.dataset.report);
          go("report");
        }),
    );
    $("#import-backup").onchange = importBackup;
  }
}
function bindForge() {
  if ($("#try-generated"))
    $("#try-generated").onclick = () =>
      start({
        id: "single-" + generated.id,
        title: generated.title,
        durationMinutes: 20,
        questions: [generated],
        maxMarks: generated.maxMarks,
      });
  if ($("#save-question"))
    $("#save-question").onclick = () =>
      download("avenquellis-question.json", generated);
  if ($("#proof-generated"))
    $("#proof-generated").onclick = () => {
      if (currentProof) proofDrafts[draftSlot()] = proofDraft;
      proofAttemptId = null;
      reviewAttemptId = null;
      reviewQuestion = generated;
      proofDraft = proofDrafts[generated.id] || "";
      proofResult = null;
      go("proof");
    };
  if ($("#start-generated-mock"))
    $("#start-generated-mock").onclick = () => start(generatedMock);
  if ($("#export-mock"))
    $("#export-mock").onclick = () =>
      download("avenquellis-practice-test.json", generatedMock);
}
function bindReview() {
  if (!$("#review-form")) return;
  $("#review-form").onsubmit = (e) => {
    e.preventDefault();
    try {
      const scores = {};
      document
        .querySelectorAll("[data-score]")
        .forEach((e) => (scores[e.dataset.score] = Number(e.value)));
      const r = finalizeReview({
        question: currentProof,
        criterionScores: scores,
        reviewer: $("#reviewer").value,
        rationale: $("#rationale").value,
        answer: proofDraft,
      });
      reviews.unshift({
        ...r,
        questionTitle: currentProof.title,
        attemptId: proofAttemptId,
        answer: proofDraft,
      });
      reviews = reviews.slice(0, 100);
      persist();
      toast(
        `Assessment recorded: ${r.score}/${r.maxMarks}. Reviewer identity unverified.`,
      );
      go("progress");
    } catch (err) {
      toast(err.message);
    }
  };
}
async function importBackup(e) {
  const file = e.target.files[0];
  // Clear the choice so that choosing the same file again, after Cancel or a rejected file, is noticed.
  e.target.value = "";
  if (!file) return;
  try {
    if (file.size > 10000000) throw Error("Backup exceeds 10 MB.");
    const restored = validateBackup(JSON.parse(await file.text()));
    modal(
      `<h2 class="modal-title">Restore this ${restored.mode === "active" ? "active draft" : "backup"}?</h2><p class="subtitle">${restored.mode === "active" ? "This replaces the current active test. History and proof drafts stay in place." : "This replaces completed sessions, assessments, the active test and proof drafts. Backups that contain model reviews also replace this device’s saved practice reviews."} Export your current backup first if needed. Saved deadlines are preserved.</p><div class="button-group spacer"><button class="button" id="confirm-import">Restore backup</button><button class="button secondary" id="export-before-import">Export current backup ↓</button><button class="button ghost" id="cancel-import">Cancel</button></div>`,
    );
    $("#export-before-import").onclick = () =>
      download("avenquellis-before-restore.json", {
        schema: "avenquellis-backup-v1",
        history,
        reviews,
        session,
        proofDraft,
        proofId,
        reviewQuestion,
        proofDrafts,
        proofAttemptId,
        reviewAttemptId,
        bookmarks,
      });
    $("#confirm-import").onclick = () => {
      if (restored.mode !== "active") {
        if (restored.modelReviews !== null && !replaceModelReviews(restored.modelReviews)) {
          toast("Browser storage could not restore the practice reviews. Your workspace was left as it was.");
          return;
        }
        history = restored.history.map((a) => finishSession(a, a.finishedAt));
        reviews = restored.reviews.map((r) => ({
          ...r,
          reviewerIdentityVerified: false,
          imported: true,
        }));
        proofDraft = restored.proofDraft || "";
        proofId =
          restored.proofId || questionBank.find((q) => q.type === "proof").id;
        reviewQuestion = restored.reviewQuestion || null;
        proofDrafts = restored.proofDrafts || {};
        proofAttemptId = restored.proofAttemptId || null;
        reviewAttemptId = restored.reviewAttemptId || null;
        proofResult = null;
        activeReport = null;
        bookmarks = restored.bookmarks || [];
      }
      session = restored.session || null;
      persist();
      $("#modal").close();
      render();
      toast("Backup restored. Numeric results recalculated.");
    };
    $("#cancel-import").onclick = () => $("#modal").close();
  } catch (err) {
    toast(err.message);
  }
}
$(".skip").onclick = (e) => {
  e.preventDefault();
  $("#main").focus();
};
$(".mobile-menu").onclick = () => {
  const open = $(".sidebar").classList.toggle("open");
  $(".mobile-menu").setAttribute("aria-expanded", String(open));
};
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    $(".sidebar").classList.remove("open");
    $(".mobile-menu").setAttribute("aria-expanded", "false");
  }
});
$(".close-modal").onclick = () => $("#modal").close();
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) $("#modal").close();
});
function showMotion() {
  const label = paused ? "Resume 3D animation" : "Pause 3D animation";
  $("#motion").textContent = paused ? "▷" : "Ⅱ";
  $("#motion").setAttribute("aria-label", label);
  $("#motion").title = label;
}
$("#motion").onclick = () => {
  paused = !paused;
  persist();
  showMotion();
  if (page === "overview") mountOrbit($("#orbit"), paused);
};
showMotion();
window.addEventListener("hashchange", () => {
  render();
  window.scrollTo(0, 0);
});
setInterval(() => {
  if (!session) return;
  const remaining = remainingSeconds(session);
  if ($("#timer")) $("#timer").textContent = timeText(remaining);
  if ((remaining === 0 || session.submittedAt != null) && completingSession !== session) {
    const expired = session.submittedAt == null;
    if ($("#modal").open) $("#modal").close();
    void complete();
    if (expired) toast("Time is up. Your work has been saved.");
  }
}, 1000);
render();

offlineNotices.deliver((event) => {
  if (event.type === "avenquellis:offline-update-ready") {
    toast(event.detail.message);
    return;
  }
  const status = document.querySelector("#offline-status");
  if (status) {
    status.textContent = "Ready offline · source PDFs need internet";
    status.title =
      "The app and exact C++ engine are saved on this device. Browser storage may be cleared by your browser.";
  }
});
