# Avenquellis

A 3D mathematics workspace for CMI, ISI and Class XII olympiad preparation, hosted on **[Cloudflare Pages](https://avenquellis.pages.dev/)**. The GitHub source repository and learning website are public.

## Run and verify

Use Node.js 20+ and Wrangler. The live generator and grader require Pages Functions.

```sh
npm start        # local Pages Functions and browser UI on port 4173
npm test
npm run build
```

The build creates a content-hashed offline snapshot, validates the official catalog, checks JavaScript syntax, verifies vendored module hashes, and validates the compiled WebAssembly artifact. `npm run start:static` only previews the static shell. Use `npm start` for hosted generation and assessment fallback; the static preview also supports the loaded local certificate checker. Cloud transcription and model readings require the authenticated Workers AI binding.

## What is implemented

- Draggable torus, Möbius strip and saddle surfaces, responsive chapter library, searchable problem collection, bookmarks, timed tests, saved deadlines, flagging, answer review, and export/import backups.
- 48 authored question families across six topics. Reproducible generation produces single questions, chapter sections and mock tests. RMO generation uses proof questions and omits calculus/probability. Finite template variation is not a guarantee of novelty or calibrated exam difficulty.
- Cancel a pending question or mock generation directly in the forge and retry with new settings. Leaving the page also cancels its pending request. Generation uploads have a 10-second deadline and a 4096-byte limit; stalled or oversized streams return a bounded error without waiting for stream cleanup.
- 16 official papers/sample sets with 62 chapter-tagged question references. CMI/RMO papers and ISI samples retain their true categories. Timed companions use the official PDFs; the catalog is **not a full transcription**. Unknown official marks/timings remain unspecified. See [ARCHIVE-SOURCES.md](ARCHIVE-SOURCES.md).
- The user's original **[AxiomMath C++20 library](https://github.com/TARUNTEjjjj/axiom-math)** compiled to WebAssembly, using pinned source `ae5b38257b7825db603ecd5c7b28ade32c1a613f` and Emscripten 6.0.13. The shipped module performs exact fraction arithmetic and expression comparison in the browser. Numeric marking uses exact equality, with no floating-point tolerance. Engine/key failures remain pending rather than becoming zero marks.
- An exact mathematics lab with calculation traces, plus explicit arithmetic-equality checks within proof drafts. The C++ grammar supports integers, finite decimals, `+ - * /`, signs and parentheses. It does not support variables, powers, roots, functions, symbolic identities, or general proof verification. Fractions use checked signed 64-bit values with 128-bit intermediates; overflow is reported.
- Proof writing with a symbol toolbar, problem-specific partial-credit rubrics and preserved submissions. Free-form proofs can receive two model readings with quoted evidence and provisional criterion marks. A human can finalize a recorded assessment. Two number-theory families can also be marked automatically from structured proofs: consecutive-factor divisibility checks all residue classes and a Bézout witness; gcd invariance checks both common-divisor inclusions by exact linear identities. Only a complete certificate earns a final practice score. Partial certificates display verified credit as a lower bound, never a judgement of alternative prose. Editing a submitted proof creates a detached draft and cannot change the grade of the original attempt.
- Chapter progress counts first answered numeric attempts per distinct problem, excludes blanks and pending checks, and does not present self-assessed proof marks as automatically verified performance.
- Preparing a proof review and submitting a test use the loaded C++ checker on device, avoiding per-answer network waits. If that engine is unavailable, the hosted checker remains a fallback. Ordinary prose stays pending human review; model marking is a separate explicit action.
- Startup loads the arithmetic engine, proof checker and paper catalog concurrently with an eight-second fallback deadline, so stalled optional downloads do not hide saved work.
- Offline app assets, question templates and the C++ engine after a successful first installation. External PDFs still require internet. Application updates wait until every open app window confirms that it is safe and idle; active tests and unsaved edits defer activation. Older windows without the safety protocol must close first. Browser storage availability/eviction can affect offline access.

[Production checks](docs/RELEASE-CHECK.md) cover individual questions, mixed and chapter mocks, handwritten submissions, complete certificates and partial prose.

## Three repositories

| Repository | Responsibility |
| --- | --- |
| [avenquellis-web](https://github.com/TARUNTEjjjj/avenquellis-web) | Static UI, 3D canvas, timed sessions, progress, archives, PWA |
| [avenquellis-question-engine](https://github.com/TARUNTEjjjj/avenquellis-question-engine) | C++20 library and `avenquellis-questions` CLI for questions, chapter sets, and mocks. Also supplies the browser question catalog and AxiomMath WebAssembly build. |
| [avenquellis-proof-grader](https://github.com/TARUNTEjjjj/avenquellis-proof-grader) | C++20 library and `avenquellis-grader` CLI for proof certificates, partial credit, human assessments, and review proposals. Also supplies the hosted model adapter and benchmark tools. |

For backend use, build and install the tools from their respective repositories with CMake. The generator emits JSON that the grader accepts in the `question` field of an assessment request alongside an `answer`. These commands run without opening the website. The live question endpoints and proof checker run the same C++ sources compiled to WebAssembly in Cloudflare Pages Functions. Optional handwritten proof uploads are transcribed on explicit request. Students check and apply the text before asking for marks.

The website uses vendored browser modules; it needs no model key or paid API for the shipped experience. To update these assets, place the repositories side by side, obtain the verified `browser/` artifact from the engine's verified Wasm build workflow (or build it with the documented pinned Emscripten toolchain), then run:

```sh
npm run sync:engines
npm test
npm run build
```

The sync validates compiled artifact hashes before replacing any files, preserves the original MIT notice, and records module versions, SHA-256 hashes and the engine build commit in `dist/lib/vendor-provenance.json`. `dist/math/build-info.json` records original source hashes and compiler flags. Do not edit vendored files as the source of truth.

## Cloudflare Pages deployment

This is a direct-upload Pages project, `avenquellis`, with production branch `main`. No paid Workers service is required for static hosting. Use the existing authenticated Cloudflare account:

```sh
npm run deploy
```

The command runs tests, rebuilds the offline snapshot, and stages the Pages bundle before invoking pinned Wrangler. The two optional GPU modules are packed into small gzip fragments because large uploads may fail on slow connections. A restricted Pages Function serves the original JavaScript and Wasm bytes at their normal same-origin URLs. The packer verifies the original hashes and round-trip bytes. All other published resources are direct static assets. `wrangler.jsonc` identifies the Pages output directory. `_headers` supplies a restrictive content policy allowing the local Wasm engine. Navigation uses hash routes. GitHub CI checks each push; deployment is an explicit command, not an automatic CI upload. See [Cloudflare's direct-upload documentation](https://developers.cloudflare.com/pages/get-started/direct-upload/).

## Proof grading and data limits

Published [IMO regulations](https://www.imo-official.org/regulations/) and [UKMT marking guidance](https://ukmt.org.uk/wp-content/uploads/2023/12/BMO1-2023-Markers-Report-.pdf) inform criterion-based partial credit and complete-argument review. This adaptation does not establish examiner-level software accuracy or institutional endorsement.

The [Proof Studio](https://avenquellis.pages.dev/#proof) and completed test reports support marking free-form answers to authored bank and generated proof questions. Official PDF companion questions without a transcribed statement and an authored rubric remain human-reviewed. “Mark my proof” sends that answer to the same-origin Pages Function. The server reconstructs the problem and rubric, then calls Llama 3.3 70B twice through the Cloudflare Workers AI binding. Each positive award needs a verbatim quote. The UI shows one provisional mark only if both readings agree on each criterion; otherwise it shows their separate proposals, a range or an abstention. Practice suggestions do not enter verified test totals. No model call happens just by writing or submitting a test.

Production explicitly selects `verbatim-v1`. The experimental `span-v2` protocol is retained for reproducible research, but it is not enabled for student marks. On three untouched USAMO research responses, its two readings awarded full credit to all three while human scores were 1, 2 and 1 out of 7. The production protocol abstained on all six USAMO research cases and on five separate human-scored IMO-GradingBench proofs, including three partial proofs. It agreed with the published 7/7 on one complete Gemini IMO proof. The datasets and samples differ; no combined accuracy percentage is justified.

The site uses the existing Workers Free plan, with [10,000 free neurons per day](https://developers.cloudflare.com/workers-ai/platform/pricing/). Two reviews per submission draw from this shared allowance. When it is exhausted, hosted marking must wait for the reset. The optional browser model, Qwen3 1.7B, downloads roughly 1 GB on explicit request and requires a compatible WebGPU device. It keeps proof content local. It matched only 3 of its 12 suggested marks on a 24-proof pilot, so the interface presents it as experimental feedback.

See [Sources & methods](https://avenquellis.pages.dev/#sources) for the blind score comparisons and their limits. [Per-case evidence and reproduction instructions](https://github.com/TARUNTEjjjj/avenquellis-proof-grader/tree/main/benchmark/evidence) distinguish expert research labels from official competition marks. The same model can make the same mistake twice. No agreement rate here establishes examiner-level accuracy on CMI, ISI or RMO scripts.

Answers, drafts, bookmarks and reviews live in this browser's local storage, without cross-device sync or server backup. The workspace keeps up to 100 completed sessions; if browser storage fills up first, the oldest sessions are removed so that current work still saves, and a notice says how many. For the latest 20 exact answers the browser can retain one hosted and one local review, keyed to the problem, rubric and answer. Both can be exported in the proof, its attempt or a global backup. Restored reviews are labeled unverified. Export backups from Your progress. Reviewer names are user-entered and unverified. Worked solutions are included in the public app code: this is a learning workspace, not a secure exam system or a source of certified grades.

## GitHub resource collection

Explore the project-specific [resource catalog](resources/README.md): curated references, star-ranked discovery, dated source metadata, cached failure recovery and an optional read-only server API. The daily refresh workflow updates the public catalog. The resource library reads the latest GitHub snapshot with a bundled offline fallback; application-code updates still follow the existing deployment process.

The web resource library now checks for fresh public metadata every 15 minutes while an app tab is open and saves the latest validated collection for offline visits. It shows successful-check and source-observation dates separately, preserves good data during failures, and keeps its offline storage separate from application progress. See [resource update and offline behavior](resources/README.md#automatic-checks-and-offline-collections-in-the-web-app).
