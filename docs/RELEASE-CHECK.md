# Avenquellis production verification

## Engine synchronization — 19 November 2026

- Re-vendored both engines from their current `main` with `npm run sync:engines`: the question-engine edge release built from `d8cbddf` (versioned references), the AxiomMath browser module at pinned source `f922f9c` built from question-engine `9bb5dcf` (64 KiB trace cap), and the native grader built from `ddd2632` (Unicode whitespace and UTF-16 reviewer limits). No vendored file had local edits, and the web-owned upload and disconnect handling in `functions/`, `server/native-generator/index.js` and `wrangler.jsonc` is unchanged.
- All three WebAssembly modules were rebuilt on macOS with the engines' own build scripts and their workflows' pinned emsdk (`d7b4130`, Emscripten 6.0.13). Each matched the artifact its repository commits or its CI published byte for byte; only the recorded source commits differ. The AxiomMath build also passed `--upstream` against the pinned `axiom-math` commit.
- Migration order: the first commit ships the adapter that accepts `version`; the next makes hosted checks and model reviews send `generator.version`. A saved test reloaded in Chrome sent version 0.1.0 and the actual Pages checker route resolved it; an unversioned reference still resolves; a reference naming another version is refused with HTTP 404 and its proof stays pending review.
- In Chrome, a 512-term sum showed its complete value 512, the first 239 trace steps and a note that 272 later steps were left out.
- 254 JavaScript tests passed. The build checked 44 JavaScript files, 29 vendored engine assets and 44 offline snapshot entries. The submission, saved-reference/arithmetic-trace, generation, stalled-checker, storage-quota and backup-import browser checks passed in local Chrome. The engines' own suites passed: question engine 74 JavaScript tests and `edge/verify.mjs`, proof grader 162 JavaScript tests and `wasm/check.mjs`.

These are local artifact and browser checks, not a post-deployment check of the public site.

## Reliability review — 7 November 2026

- 66 JavaScript tests passed, including new regressions that keep malformed successful checker results and unreadable answer keys pending instead of awarding zero marks. Incorrect learner literals still receive their normal result.
- Synchronized the reviewed question-engine and proof-grader sources through the verified engine sync. The binomial helper now handles impossible selections and unsafe numeric results explicitly, and rejected grading request bodies are cancelled without waiting for cleanup.
- The build validated 31 JavaScript files, 16 official paper records, 62 references, 29 vendored engine assets and all 39 offline snapshot entries. Pages staging verified packed optional GPU assets without downloading model weights.
- The source libraries passed 36 and 85 JavaScript tests respectively, their actual WebAssembly checks, and four native CTest suites each, including native/browser parity and installed consumers.
- The student-facing data explanation now accurately describes local checking first and hosted fallback when the local checker is unavailable. No model inference was requested in these checks.

These are local implementation and artifact checks. They do not establish examiner accuracy, user-capacity guarantees, or post-deployment browser behavior. Historical production checks follow.

## Prior production verification

To repeat native parity checks, run `node scripts/check-native-pages.mjs https://avenquellis.pages.dev /path/to/avenquellis-questions` from this repository. It compares complete results for single questions, chapter sets and full mocks and tests rejected combinations. It uses no model inference.

The following checks used a fresh Chrome profile against [the public Cloudflare Pages site](https://avenquellis.pages.dev/). The production deployment tested was [9e86c0c0](https://9e86c0c0.avenquellis.pages.dev/).

| Path through the student interface | Observed result |
| --- | --- |
| Forge one CMI proof question, assemble an 18-question mixed mock, and start a 12-question Test Arena mock | All three API responses identified the C++ engine. Every field matched the installed native CLI output given the same options and seed. |
| Assemble a six-question RMO number-theory section and open its first proof | All six question IDs matched the CLI fixture. The proof field accepted a photo. Numeric fields did not offer the handwriting control. |
| Upload the supplied gcd sample, request transcription, inspect it and add the reviewed answer | Transcription alone left the answer empty. The reviewed answer survived question navigation, submission and reopening the original answer in Proof Studio. |
| Submit a complete divisibility certificate in the same timed test | The native checker awarded 10/10. In a separate preview run an incomplete gcd certificate earned a verified lower bound of 4/10. |
| Request hosted readings of the corrected gcd proof | Both proposed 10/10. C++ validated their proposals and the final score stayed unset. |
| Submit only the forward gcd inclusion in ordinary prose | Both readers awarded 4/10, matching the authored criterion. The other two criteria received no points and the final score stayed unset. This is a controlled example, not a human-examiner benchmark. |
| Install the production service worker, open a new controlled tab and disconnect the network | At a 390-pixel viewport the cached C++ checker still verified a 4/10 lower bound for the partial gcd certificate. The image chooser fit the viewport. Hosted OCR and prose review need a connection. |

A separate transcription check on a genuine Leibniz manuscript crop returned the published arithmetic line `1 + 3 + 5 + 7 + 9 = 25 - 0 = 25` exactly. This single line does not establish recognition accuracy for full pages, diagrams or unfamiliar handwriting. The historical crop and research annotation are not distributed with the application. [Hannover library record](https://digitale-sammlungen.gwlb.de/resolve?id=00068086) · [HME-Leibniz reference dataset](https://doi.org/10.5281/zenodo.18804566)

The hosted review policy used for students abstained on six unseen USAMO research responses and five separate human-scored IMO-GradingBench responses, including three partial proofs. These evaluation cases are distinct from our authored smoke tests. [Human comparison and scope](https://avenquellis.pages.dev/#sources) · [Private benchmark evidence](https://github.com/TARUNTEjjjj/avenquellis-proof-grader/tree/main/benchmark/evidence)
