import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
async function repositoryRoot(name) {
  const preferred=resolve(root,"..",name);
  try {await access(join(preferred,"package.json"));return preferred;}
  catch {return resolve(root,"..",name.replace(/^avenquellis-/,"noether-"));}
}
const engineRoot = await repositoryRoot("avenquellis-question-engine");
const browserFiles = [
  "exact-math.js",
  "axiom-math-runtime.js",
  "axiom-math-runtime.wasm",
  "build-info.json",
  "source-commit.txt",
  "AXIOM-MATH-LICENSE.txt",
];
const generatorFiles = ["adapter.mjs", "manifest.json", "avenquellis-questions.wasm"];
const graderFiles = ["runtime.js", "native-grader.js", "avenquellis-grader-runtime.js",
  "avenquellis-grader-runtime.wasm", "build-info.json", "source-commit.txt", "THIRD-PARTY-NOTICES.txt"];
const components = [
  {
    repository: "avenquellis-question-engine",
    source: "src/advanced-templates.js",
    destination: "dist/lib/advanced-templates.js",
  },
  {
    repository: "avenquellis-question-engine",
    source: "src/index.js",
    destination: "dist/lib/questions.js",
  },
  {
    repository: "avenquellis-proof-grader",
    source: "src/index.js",
    destination: "dist/lib/grader.js",
  },
  {
    repository: "avenquellis-proof-grader",
    source: "src/certificate.js",
    destination: "dist/lib/certificate.js",
  },
  {repository:"avenquellis-proof-grader",source:"src/native-consensus.js",destination:"dist/lib/native-consensus.js"},
  ...['index.js','provider.js','service.js','pages.js','span-v2.js','native-consensus.js'].map(name=>({
    repository:'avenquellis-proof-grader',source:`src/${name}`,destination:`server/grader/${name}`
  })),
  ...generatorFiles.map(name => ({
    repository: "avenquellis-question-engine",
    source: "release/edge/" + name, destination: "server/native-generator/" + name,
  })),
  ...graderFiles.map(name => ({
    repository: "avenquellis-proof-grader",
    source: "edge/" + name, destination: "dist/lib/native-grade/" + name,
  })),
  ...browserFiles.map((name) => ({
    repository: "avenquellis-question-engine",
    source: `browser/${name}`,
    destination: `dist/math/${name}`,
  })),
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
// Validate the complete distribution before replacing any published asset.
const inputs = await Promise.all(
  components.map(async (item) => {
    const sourceRoot = await repositoryRoot(item.repository);
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
const input = name => inputs.find(item => item.source === name);
const generator = JSON.parse(input("release/edge/manifest.json").bytes);
const generatorWasm = input("release/edge/" + generator.wasm);
assert.equal(generatorWasm.bytes.length, generator.bytes);
assert.equal(generatorWasm.sha256, generator.sha256);
assert.equal(input("release/edge/adapter.mjs").sha256, generator.adapterSha256);
const grader = JSON.parse(input("edge/build-info.json").bytes);
for (const [name, metadata] of Object.entries(grader.artifacts)) {
  assert.equal(input("edge/" + name)?.sha256, metadata.sha256, "Invalid grader artifact: " + name);
  assert.equal(input("edge/" + name).bytes.length, metadata.bytes);
}
const modules = inputs.filter(item => item.source.endsWith(".wasm"));
for (const module of modules) assert.ok(WebAssembly.validate(module.bytes), "Invalid WebAssembly: " + module.source);
const sourceCommit = input("browser/source-commit.txt").bytes.toString().trim();
const nativeGraderCommit = input("edge/source-commit.txt").bytes.toString().trim();
for (const commit of [sourceCommit, nativeGraderCommit, generator.sourceCommit]) {
  assert.match(commit, /^[a-f0-9]{40}$/, "Invalid build source commit");
}
for (const item of inputs) {
  const destination = join(root, item.destination);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination + ".tmp", item.bytes);
  await rename(destination + ".tmp", destination);
}
const provenance = {
  formatVersion: 3,
  description:
    "Byte-for-byte copies from the private sibling repositories; compiled artifacts verified against build-info.json. Run npm run sync:engines after engine changes.",
  engineBuildCommit: sourceCommit,
  generatorBuildCommit: generator.sourceCommit,
  graderBuildCommit: nativeGraderCommit,
  components: inputs.map(({ bytes, ...item }) => item),
};
await writeFile(
  join(root, "dist/lib/vendor-provenance.json"),
  JSON.stringify(provenance, null, 2) + "\n",
);
console.log(
  `Synchronized ${inputs.length} engine assets, including verified C++ WebAssembly (${modules.length} modules).`,
);
