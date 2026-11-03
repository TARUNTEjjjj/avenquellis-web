import { assessOnServer } from "./backend.js";
import { assessNative } from "./lib/native-grader.js";
import { certificateHelp } from "./lib/certificate.js";

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

/** The same blank guide is safe to display during a timed test. */
export function certificateGuide(question) {
  const help = certificateHelp(question);
  if (!help) return "";
  return `<section class="spacer" data-certificate-guide="${escape(question.id)}">
    <details class="details">
      <summary>Use a structured proof certificate</summary>
      <p>Fill in the mathematical witnesses requested in this scaffold, or write your proof in your own words for a human reviewer.</p>
      <p>${escape(help.instructions)}</p>
      <pre class="solution" style="white-space:pre-wrap;overflow-wrap:anywhere"><code>${escape(help.scaffold)}</code></pre>
      <div class="button-group">
        <button type="button" class="button small secondary" data-insert-certificate>Insert blank scaffold</button>
        <span data-certificate-check-slot></span>
      </div>
      <p class="tiny" data-scaffold-status></p>
    </details>
    <div aria-live="polite" data-certificate-result></div>
  </section>`;
}

/** Discover supported questions without hard-coding question IDs or titles. */
export function certificateExamples(questions) {
  const examples = questions.filter((question) => certificateHelp(question));
  if (!examples.length) return "";
  return `<section class="card" aria-label="Structured proof exercises">
    <span class="eyebrow">CHECK A PROOF STEP BY STEP</span>
    <h3>Try a proof certificate</h3>
    <p>Choose a problem below to supply witnesses the checker can verify. A complete certificate earns the problem’s marks. A partial certificate shows confirmed credit for a reviewer to build on.</p>
    <div class="button-group">${examples
      .map(
        (question) =>
          `<button type="button" class="button small secondary" data-certificate-example="${escape(question.id)}">${escape(question.title)} ↗</button>`,
      )
      .join("")}</div>
  </section>`;
}

/** Use in the Proof Studio and in the report for a completed test. */
export function certificateResult(result) {
  if (!result)
    return `<div class="notice spacer"><strong>No structured certificate was recognized.</strong>
    <p>Your free-form proof can still be assessed with the problem rubric. To use the checker, follow the scaffold format shown above.</p></div>`;
  const complete = result.complete === true && Number.isFinite(result.score);
  const heading = complete
    ? "Complete certificate verified"
    : "Certificate needs review";
  const marks = complete
    ? `${result.score} / ${result.maxMarks} marks verified`
    : `${result.lowerBoundPoints} / ${result.maxMarks} marks verified so far`;
  const detail = complete
    ? "The supplied witnesses satisfy every obligation in this problem’s certificate."
    : "The verified marks are a lower bound. A reviewer must assess the remaining reasoning, including alternative valid arguments.";
  const rows = (result.criteria || [])
    .map(
      (criterion) => `
    <div class="rubric-row"><span><strong>${escape(criterion.id)} · ${criterion.verified ? "Verified" : "Needs review"}</strong><br>${escape(criterion.feedback)}</span>
      <span>${escape(criterion.points)} / ${escape(criterion.maxPoints)}</span></div>`,
    )
    .join("");
  const feedback = (result.feedback || [])
    .map((message) => `<li>${escape(message)}</li>`)
    .join("");
  return `<section class="card spacer" aria-label="Proof certificate result">
    <div class="card-head"><h3>${heading}</h3><span class="badge ${complete ? "mint" : "violet"}">${escape(marks)}</span></div>
    <p>${detail}</p>${rows}${feedback ? `<ul class="sources-list">${feedback}</ul>` : ""}
    ${result.notice ? `<p class="tiny">${escape(result.notice)}</p>` : ""}
  </section>`;
}

/** Pass an onCheck callback only on practice pages. Timed sessions get insertion alone. */
export function bindCertificateGuide(question, textarea, { onCheck } = {}) {
  if (!textarea) return;
  const help = certificateHelp(question);
  const guide = [
    ...textarea.getRootNode().querySelectorAll("[data-certificate-guide]"),
  ].find((element) => element.dataset.certificateGuide === question.id);
  if (!help || !guide || guide.dataset.bound === "true") return;
  guide.dataset.bound = "true";

  const insert = guide.querySelector("[data-insert-certificate]");
  const status = guide.querySelector("[data-scaffold-status]");
  const output = guide.querySelector("[data-certificate-result]");
  let check;
  if (typeof onCheck === "function") {
    check = guide.ownerDocument.createElement("button");
    check.type = "button";
    check.className = "button small violet";
    check.textContent = "Check certificate";
    guide.querySelector("[data-certificate-check-slot]").append(check);
    check.onclick = async () => {
      const answer=textarea.value;check.disabled=true;
      try {
        const assessment=await (navigator.onLine?assessOnServer(question,answer):assessNative(question,answer));
        if(!guide.isConnected || textarea.value!==answer)return;
        const result=assessment?.lowerBoundPoints!=null?assessment:null;
        output.innerHTML = certificateResult(result);
        onCheck(result);
      } catch {
        output.textContent =
          "The certificate checker could not finish. Your answer remains available for human review.";
        onCheck(null);
      } finally {check.disabled=false;}
    };
  }

  function refreshControls() {
    insert.disabled = textarea.value.length > 0;
    status.textContent = insert.disabled
      ? "Your editor contains work. You can copy the scaffold above and add the parts you need."
      : "Insert the scaffold into the empty answer field to begin.";
    if (check) check.disabled = !textarea.value.trim();
  }
  insert.onclick = () => {
    if (textarea.value.length) return;
    textarea.value = help.scaffold;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
  };
  textarea.addEventListener("input", () => {
    refreshControls();
    output.replaceChildren();
    if (check) onCheck(null);
  });
  refreshControls();
}
