import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engineRoot = resolve(root, "../noether-question-engine");
const browserFiles = [
  "exact-math.js",
  "axiom-math-runtime.js",
  "axiom-math-runtime.wasm",
  "build-info.json",
  "source-commit.txt",
  "AXIOM-MATH-LICENSE.txt",
];
const components = [
  {
    repository: "noether-question-engine",
    source: "src/advanced-templates.js",
    destination: "dist/lib/advanced-templates.js",
  },
  {
    repository: "noether-question-engine",
    source: "src/index.js",
    destination: "dist/lib/questions.js",
  },
  {
    repository: "noether-proof-grader",
    source: "src/index.js",
    destination: "dist/lib/grader.js",
  },
  {
    repository: "noether-proof-grader",
    source: "src/certificate.js",
    destination: "dist/lib/certificate.js",
  },
  ...['index.js','provider.js','service.js','pages.js'].map(name=>({
    repository:'noether-proof-grader',source:`src/${name}`,destination:`server/grader/${name}`
  })),
  ...browserFiles.map((name) => ({
    repository: "noether-question-engine",
    source: `browser/${name}`,
    destination: `dist/math/${name}`,
  })),
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
// Validate the complete distribution before replacing any published asset.
const inputs = await Promise.all(
  components.map(async (item) => {
    const sourceRoot = resolve(root, "..", item.repository);
    const bytes = await readFile(join(sourceRoot, item.source));
    const pkg = JSON.parse(
      await readFile(join(sourceRoot, "package.json"), "utf8"),
    );
    assert.ok(bytes.length, `Source is empty: ${item.source}`);
    return {
      ...item,
      bytes,
      packageName: pkg.name,
      version: pkg.version,
      sha256: hash(bytes),
    };
  }),
);
const build = JSON.parse(
  await readFile(join(engineRoot, "browser/build-info.json"), "utf8"),
);
for (const [name, metadata] of Object.entries(build.artifacts)) {
  const item = inputs.find((input) => input.source === `browser/${name}`);
  assert.ok(item, `Unexpected compiled artifact: ${name}`);
  assert.equal(
    item.bytes.length,
    metadata.bytes,
    `Artifact size mismatch: ${name}`,
  );
  assert.equal(item.sha256, metadata.sha256, `Artifact hash mismatch: ${name}`);
}
const wasm = inputs.find((input) => input.source.endsWith(".wasm"));
assert.ok(
  WebAssembly.validate(wasm.bytes),
  "Compiled C++ artifact is not valid WebAssembly",
);
const sourceCommit = inputs
  .find((input) => input.source.endsWith("source-commit.txt"))
  .bytes.toString()
  .trim();
assert.match(sourceCommit, /^[a-f0-9]{40}$/, "Invalid build source commit");
for (const item of inputs) {
  const destination = join(root, item.destination);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination + ".tmp", item.bytes);
  await rename(destination + ".tmp", destination);
}
const provenance = {
  formatVersion: 2,
  description:
    "Byte-for-byte copies from the private sibling repositories; compiled artifacts verified against build-info.json. Run npm run sync:engines after engine changes.",
  engineBuildCommit: sourceCommit,
  components: inputs.map(({ bytes, ...item }) => item),
};
await writeFile(
  join(root, "dist/lib/vendor-provenance.json"),
  JSON.stringify(provenance, null, 2) + "\n",
);
console.log(
  `Synchronized ${inputs.length} engine assets, including verified C++ WebAssembly (${wasm.bytes.length} bytes).`,
);
