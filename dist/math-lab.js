const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function mathLabView(ready) {
  return `<div class="heading-row"><div><h1>Exact, all the way down.</h1><p class="subtitle">Your AxiomMath C++ engine, running inside the browser.</p></div><span class="badge ${ready ? "mint" : ""}">${ready ? "C++ / WEBASSEMBLY · READY" : "EXPRESSION ENGINE UNAVAILABLE"}</span></div>${ready ? "" : '<div class="notice warning">The C++ module could not load. Reload to retry. Literal integer, decimal and fraction comparisons remain available; expression evaluation is unavailable.</div>'}<div class="math-lab-hero"><span class="eyebrow">THE EXACT ARITHMETIC LAB</span><div class="lab-equation"><span>0.1 + 0.2</span><b>=</b><span class="mint-text">3 / 10</span><i>Exactly.</i></div><p>Fractions stay fractions. Decimals stay exact. Every arithmetic step has a trace.</p></div><div class="split"><section class="card"><div class="card-head"><h2>Explore an expression</h2><span class="badge">01 / EVALUATE</span></div><form id="math-evaluate"><label for="math-expression">Arithmetic expression</label><input class="math-input" id="math-expression" value="(1/3 + 1/6) * 4" maxlength="4096" spellcheck="false" autocomplete="off"><div class="example-pills"><button type="button" data-expression="(1/3 + 1/6) * 4">Fractions</button><button type="button" data-expression="0.1 + 0.2">Decimals</button><button type="button" data-expression="9007199254740993 - 9007199254740992">Large integers</button><button type="button" data-expression="1 / (2 - 2)">Undefined</button></div><button class="button" type="submit" ${ready ? "" : "disabled"}>Evaluate exactly ↗</button></form><div id="math-result" class="spacer" aria-live="polite"><p class="tiny">The result and calculation trace will appear here.</p></div></section><section class="card"><div class="card-head"><h2>Same value?</h2><span class="badge violet">02 / COMPARE</span></div><form id="math-compare"><label for="math-left">First expression</label><input class="math-input" id="math-left" value="1/3" maxlength="4096" spellcheck="false"><label for="math-right" class="spacer">Second expression</label><input class="math-input" id="math-right" value="0.3333333333333333" maxlength="4096" spellcheck="false"><button class="button secondary spacer" type="submit">Check equivalence ∴</button></form><div id="math-comparison" class="spacer" aria-live="polite"></div></section></div><div class="notice">Supports integers, finite decimals, +, −, *, / and parentheses. Variables, powers, roots and functions are outside this engine’s syntax. Exact arithmetic checks calculations; it does not prove a general mathematical claim.</div><section class="card"><h3>Built from your AxiomMath library</h3><p>The original C++20 parser and rational arithmetic are compiled to WebAssembly. Checked 64-bit fractions and 128-bit intermediate calculations preserve exact values; invalid input, division by zero and overflow return an error.</p></section>`;
}
export function bindMathLab({ evaluate, check }) {
  const $ = (s) => document.querySelector(s);
  document.querySelectorAll("[data-expression]").forEach(
    (b) =>
      (b.onclick = () => {
        $("#math-expression").value = b.dataset.expression;
        $("#math-evaluate").requestSubmit();
      }),
  );
  $("#math-evaluate").onsubmit = (e) => {
    e.preventDefault();
    const r = evaluate($("#math-expression").value);
    if (!r.ok) {
      $("#math-result").innerHTML =
        `<div class="notice warning"><strong>Cannot evaluate this expression</strong><br>${escape(r.error)}${Number.isInteger(r.position) ? ` · byte ${r.position}` : ""}</div>`;
      return;
    }
    $("#math-result").innerHTML =
      `<div class="exact-result"><span>EXACT VALUE</span><strong>${escape(r.value)}</strong></div>${r.steps?.length ? `<ol class="calculation-steps">${r.steps.map((s) => `<li><code>${escape(s.expression ?? s.text ?? "")} <b>=</b> ${escape(s.result ?? s.value ?? "")}</code></li>`).join("")}</ol>` : '<p class="tiny">This value needs no arithmetic operations.</p>'}`;
  };
  $("#math-compare").onsubmit = (e) => {
    e.preventDefault();
    const r = check($("#math-left").value, $("#math-right").value);
    $("#math-comparison").innerHTML = r.ok
      ? `<div class="comparison-result ${r.equivalent ? "equal" : "unequal"}"><strong>${r.equivalent ? "Exactly equivalent" : "Different exact values"}</strong><div>${escape(r.left)} <b>${r.equivalent ? "=" : "≠"}</b> ${escape(r.right)}</div><p>${r.equivalent ? "Both expressions reduce to the same fraction." : "An approximation is not the same as the exact answer."}</p></div>`
      : `<div class="notice warning">${escape(r.error)}</div>`;
  };
}
