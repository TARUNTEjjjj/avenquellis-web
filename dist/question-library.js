const e = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function libraryView({ questions, topics, labels, filters, bookmarks }) {
  const list = questions.filter(
    (q) =>
      (filters.topic === "all" || q.topic === filters.topic) &&
      (filters.level === "all" || q.difficulty === filters.level) &&
      (filters.type === "all" || q.type === filters.type) &&
      (!filters.saved || bookmarks.includes(q.id)) &&
      `${q.title} ${q.statement}`
        .toLowerCase()
        .includes(filters.search.toLowerCase()),
  );
  return `<div class="heading-row"><div><h1>Good problems stay with you.</h1><p class="subtitle">Browse the original collection. Save an idea. Come back with a proof.</p></div><span class="badge mint">${list.length} / ${questions.length} PROBLEMS</span></div><div class="library-controls"><div><label for="bank-topic">Chapter</label><select id="bank-topic"><option value="all">Every chapter</option>${topics.map((t) => `<option value="${t}" ${filters.topic === t ? "selected" : ""}>${labels[t]}</option>`).join("")}</select></div><div><label for="bank-level">Level</label><select id="bank-level">${["all", "foundation", "advanced", "olympiad"].map((t) => `<option value="${t}" ${filters.level === t ? "selected" : ""}>${t === "all" ? "Every level" : t[0].toUpperCase() + t.slice(1)}</option>`).join("")}</select></div><div><label for="bank-type">Answer type</label><select id="bank-type"><option value="all">All formats</option><option value="proof" ${filters.type === "proof" ? "selected" : ""}>Proof</option><option value="numeric" ${filters.type === "numeric" ? "selected" : ""}>Exact numeric</option></select></div><div><label for="bank-search">Find a problem</label><input id="bank-search" value="${e(filters.search)}" placeholder="Search ideas, statements…"></div></div><div class="section-heading"><span class="tiny">Original problems · editorial difficulty estimates · complete solutions</span><button class="filter ${filters.saved ? "active" : ""}" id="bank-saved">${filters.saved ? "★ Saved only" : "☆ Show saved"} (${bookmarks.length})</button></div><div class="library-grid">${list.map((q, i) => `<article class="card problem-card"><div class="card-head"><div><span class="problem-number">${String(questions.indexOf(q) + 1).padStart(2, "0")}</span><span class="badge ${q.difficulty === "olympiad" ? "violet" : ""}">${q.difficulty}</span></div><button class="bookmark-button ${bookmarks.includes(q.id) ? "selected" : ""}" data-bookmark="${q.id}" aria-label="${bookmarks.includes(q.id) ? "Unsave" : "Save"} ${e(q.title)}" aria-pressed="${bookmarks.includes(q.id)}">${bookmarks.includes(q.id) ? "★" : "☆"}</button></div><span class="eyebrow">${labels[q.topic]}</span><h2>${e(q.title)}</h2><p class="problem-preview">${e(q.statement)}</p><div class="card-footer"><span>${q.type === "proof" ? "∴ Proof" : "= Exact numeric"} · ${q.maxMarks} marks</span><div class="button-group"><button class="text-link" data-library-view="${q.id}">Explore ↗</button><button class="button small secondary" data-library-start="${q.id}">Practice</button></div></div></article>`).join("") || '<div class="empty"><strong>No problems match these filters.</strong>Try another chapter or clear your search.</div>'}</div>`;
}
export function bindLibrary({
  filters,
  onChange,
  onPractice,
  onExplore,
  onBookmark,
}) {
  const $ = (s) => document.querySelector(s);
  for (const [selector, key] of [
    ["#bank-topic", "topic"],
    ["#bank-level", "level"],
    ["#bank-type", "type"],
  ])
    $(selector).onchange = (ev) =>
      onChange({ ...filters, [key]: ev.target.value });
  $("#bank-search").oninput = (ev) => {
    const cursor = ev.target.selectionStart;
    onChange({ ...filters, search: ev.target.value });
    $("#bank-search").focus();
    $("#bank-search").setSelectionRange(cursor, cursor);
  };
  $("#bank-saved").onclick = () =>
    onChange({ ...filters, saved: !filters.saved });
  document
    .querySelectorAll("[data-bookmark]")
    .forEach((b) => (b.onclick = () => onBookmark(b.dataset.bookmark)));
  document
    .querySelectorAll("[data-library-view]")
    .forEach((b) => (b.onclick = () => onExplore(b.dataset.libraryView)));
  document
    .querySelectorAll("[data-library-start]")
    .forEach((b) => (b.onclick = () => onPractice(b.dataset.libraryStart)));
}
