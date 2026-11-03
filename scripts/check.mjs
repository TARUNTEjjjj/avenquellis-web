import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
for (const asset of [
  "index.html",
  "app.js",
  "style.css",
  "orbit.js",
  "backend.js",
  "handwriting.js",
  "handwriting.css",
  "lib/handwriting-image.js",
  "lib/native-grader.js",
  "lib/native-grade/avenquellis-grader-runtime.wasm",
  "archive.json",
  "lib/session.js",
  "lib/questions.js",
  "lib/grader.js",
  "lib/certificate.js",
  "certificate-ui.js",
  "math/exact-math.js",
  "math/axiom-math-runtime.js",
  "math/axiom-math-runtime.wasm",
  "math/build-info.json",
  "math/source-commit.txt",
  "math/AXIOM-MATH-LICENSE.txt",
  "sw.js",
  "offline-assets.json",
  "manifest.webmanifest",
  "_headers",
])
  assert.ok(
    (await stat(join(dist, asset))).isFile(),
    `Required asset missing: ${asset}`,
  );
async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}
let checked = 0;
for await (const file of walk(dist)) {
  if (!/\.m?js$/.test(file)) continue;
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (result.status !== 0)
    throw new Error(
      result.stderr || result.error?.message || `Syntax check failed: ${file}`,
    );
  checked++;
}
const catalog = JSON.parse(await readFile(join(dist, "archive.json"), "utf8"));
assert.ok(
  Array.isArray(catalog.papers) && catalog.papers.length > 0,
  "Archive requires papers",
);
assert.ok(
  Array.isArray(catalog.questionReferences) &&
    catalog.questionReferences.length > 0,
  "Archive requires question references",
);
const papers = new Map(catalog.papers.map((p) => [p.id, p]));
assert.equal(papers.size, catalog.papers.length, "Paper IDs must be unique");
const topics = new Set([
  "algebra",
  "number-theory",
  "combinatorics",
  "geometry",
  "calculus",
  "probability",
]);
for (const paper of catalog.papers) {
  assert.ok(
    paper.id && paper.title && ["CMI", "ISI", "RMO"].includes(paper.exam),
    "Invalid paper metadata",
  );
  assert.equal(new URL(paper.url).protocol, "https:");
  assert.ok(
    [
      "official-paper",
      "official-sample",
      "official-paper-with-solutions",
    ].includes(paper.kind),
    "Preserve official source category",
  );
  assert.ok(Number.isInteger(paper.questionCount) && paper.questionCount > 0);
  assert.ok(
    paper.durationMinutes === null ||
      (Number.isFinite(paper.durationMinutes) && paper.durationMinutes > 0),
  );
  assert.ok(
    paper.maxMarks === null ||
      (Number.isFinite(paper.maxMarks) && paper.maxMarks > 0),
  );
}
assert.equal(
  new Set(catalog.questionReferences.map((r) => r.id)).size,
  catalog.questionReferences.length,
  "Reference IDs must be unique",
);
for (const reference of catalog.questionReferences) {
  const paper = papers.get(reference.paperId);
  assert.ok(paper, `Missing paper for reference ${reference.id}`);
  assert.ok(
    topics.has(reference.topic) && reference.questionNumber && reference.title,
  );
  assert.equal(reference.exam, paper.exam);
  assert.equal(reference.year, paper.year);
  assert.equal(reference.sourceKind, paper.kind);
  assert.equal(reference.statementMode, "reference-only");
  assert.ok(Number.isInteger(reference.page) && reference.page > 0);
  assert.equal(reference.url, paper.url + "#page=" + reference.page);
}
console.log(
  `Checked ${checked} JavaScript files, required assets, ${papers.size} official papers and ${catalog.questionReferences.length} references. Static output is ready in dist/.`,
);

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const runtime = JSON.parse(await readFile(join(dist,"device-runtime/provenance.json"),"utf8"));
for (const asset of runtime.assets) {
  const bytes = await readFile(join(dist,"device-runtime",asset.name));
  assert.equal(bytes.length,asset.bytes,`Incomplete device runtime: ${asset.name}`);
  assert.equal(hash(bytes),asset.sha256,`Unexpected device runtime: ${asset.name}`);
}
const provenance = JSON.parse(
  await readFile(join(dist, "lib/vendor-provenance.json"), "utf8"),
);
for (const destination of ["dist/lib/native-grade/avenquellis-grader-runtime.wasm", "server/native-generator/avenquellis-questions.wasm"]) {
  assert.ok(provenance.components.some(item => item.destination === destination), "Missing provenance for " + destination);
  assert.ok(WebAssembly.validate(await readFile(join(root, destination))), "Invalid WebAssembly: " + destination);
}
for (const asset of provenance.components)
  assert.equal(
    hash(await readFile(join(root, asset.destination))),
    asset.sha256,
    `Vendor asset changed without synchronization: ${asset.destination}`,
  );
const compiled = JSON.parse(
  await readFile(join(dist, "math/build-info.json"), "utf8"),
);
for (const [name, metadata] of Object.entries(compiled.artifacts))
  assert.equal(
    hash(await readFile(join(dist, "math", name))),
    metadata.sha256,
    `C++ artifact does not match compiler manifest: ${name}`,
  );
assert.ok(
  WebAssembly.validate(
    await readFile(join(dist, "math/axiom-math-runtime.wasm")),
  ),
);
const offline = JSON.parse(
  await readFile(join(dist, "offline-assets.json"), "utf8"),
);
for (const asset of offline.assets)
  assert.equal(
    hash(await readFile(join(dist, asset.url))),
    asset.sha256,
    `Offline snapshot stale: ${asset.url}`,
  );
assert.ok(
  offline.assets.some((a) => a.url === "math/axiom-math-runtime.wasm"),
  "C++ engine must be available offline",
);
console.log(
  `Verified ${provenance.components.length} vendored engine assets and ${offline.assetCount} offline snapshot entries.`,
);
