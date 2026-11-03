# Noether mathematics lab

A 3D mathematics workspace for CMI, ISI and Class XII olympiad preparation, hosted on **[Cloudflare Pages](https://noether-math-lab.pages.dev/)**. The GitHub source repository is private; the learning website is public.

## Run and verify

Node.js 20+ is required. No dependency installation is needed for the app.

```sh
npm start        # http://127.0.0.1:4173
npm test
npm run build
```

The build creates a content-hashed offline snapshot, validates the official catalog, checks JavaScript syntax, verifies vendored module hashes, and validates the compiled WebAssembly artifact. Serve `dist/` over HTTP; file URLs do not support the module/fetch workflow. `PORT=4180 npm start` chooses a different loopback port.

## What is implemented

- Draggable torus, Möbius strip and saddle surfaces, responsive chapter library, searchable problem collection, bookmarks, timed tests, saved deadlines, flagging, answer review, and export/import backups.
- 48 authored question families across six topics. Reproducible generation produces single questions, chapter sections and mock tests. RMO generation uses proof questions and omits calculus/probability. Finite template variation is not a guarantee of novelty or calibrated exam difficulty.
- 16 official papers/sample sets with 62 chapter-tagged question references. CMI/RMO papers and ISI samples retain their true categories. Timed companions use the official PDFs; the catalog is **not a full transcription**. Unknown official marks/timings remain unspecified. See [ARCHIVE-SOURCES.md](ARCHIVE-SOURCES.md).
- The user's original **[AxiomMath C++20 library](https://github.com/TARUNTEjjjj/axiom-math)** compiled to WebAssembly, using pinned source `ae5b38257b7825db603ecd5c7b28ade32c1a613f` and Emscripten 6.0.13. The shipped module performs exact fraction arithmetic and expression comparison in the browser. Numeric marking uses exact equality, with no floating-point tolerance. Engine/key failures remain pending rather than becoming zero marks.
- An exact mathematics lab with calculation traces, plus explicit arithmetic-equality checks within proof drafts. The C++ grammar supports integers, finite decimals, `+ - * /`, signs and parentheses. It does not support variables, powers, roots, functions, symbolic identities, or general proof verification. Fractions use checked signed 64-bit values with 128-bit intermediates; overflow is reported.
- Proof writing with a symbol toolbar, problem-specific partial-credit rubrics and preserved submissions. Free-form proofs remain pending until an explicit human review or self-assessment is recorded. Two number-theory families can also be marked automatically from structured proofs: consecutive-factor divisibility checks all residue classes and a Bézout witness; gcd invariance checks both common-divisor inclusions by exact linear identities. Only a complete certificate earns a final practice score. Partial certificates display verified credit as a lower bound, never a judgement of alternative prose. Editing a submitted proof creates a detached draft and cannot change the grade of the original attempt.
- Chapter progress counts first answered numeric attempts per distinct problem, excludes blanks and pending checks, and does not present self-assessed proof marks as automatically verified performance.
- Offline app assets, question templates and the C++ engine after a successful first installation. External PDFs still require internet. Updates wait for all old app tabs to close so a running test is not interrupted. Browser storage availability/eviction can affect offline access.

## Three private repositories

| Repository | Responsibility |
| --- | --- |
| [noether-web](https://github.com/TARUNTEjjjj/noether-web) | Static UI, 3D canvas, timed sessions, progress, archives, PWA |
| [noether-question-engine](https://github.com/TARUNTEjjjj/noether-question-engine) | Questions, worked solutions, rubrics, mock assembly, pinned native C++ and verified Wasm build |
| [noether-proof-grader](https://github.com/TARUNTEjjjj/noether-proof-grader) | Review workflow, evidence validation, authenticated model adapter, benchmark runner |

The website uses vendored browser modules; it needs no model key or paid API for the shipped experience. To update these assets, place the repositories side by side, obtain the verified `browser/` artifact from the engine's verified Wasm build workflow (or build it with the documented pinned Emscripten toolchain), then run:

```sh
npm run sync:engines
npm test
npm run build
```

The sync validates compiled artifact hashes before replacing any files, preserves the original MIT notice, and records module versions, SHA-256 hashes and the engine build commit in `dist/lib/vendor-provenance.json`. `dist/math/build-info.json` records original source hashes and compiler flags. Do not edit vendored files as the source of truth.

## Cloudflare Pages deployment

This is a direct-upload Pages project, `noether-math-lab`, with production branch `main`. No paid Workers service is required for static hosting. Use the existing authenticated Cloudflare account:

```sh
npm run deploy
```

The command tests, rebuilds the offline snapshot and deploys `dist/` using pinned Wrangler. `wrangler.jsonc` identifies the Pages output directory. `_headers` supplies a restrictive content policy allowing the local Wasm engine. Navigation uses hash routes. GitHub CI checks each push; deployment is an explicit command, not an automatic CI upload. See [Cloudflare's direct-upload documentation](https://developers.cloudflare.com/pages/get-started/direct-upload/).

## Proof grading and data limits

Published [IMO regulations](https://www.imo-official.org/regulations/) and [UKMT marking guidance](https://ukmt.org.uk/wp-content/uploads/2023/12/BMO1-2023-Markers-Report-.pdf) inform criterion-based partial credit and complete-argument review. This adaptation does not establish examiner-level software accuracy or institutional endorsement.

The hosted website offers exact arithmetic, structured proof checking on two specified families, and human review. The separate grader service includes a real server-side provider adapter and two blind model passes, strict evidence/criterion checks, timeout and input limits, authentication, and a benchmark runner. It has **not been connected to a paid provider or exposed by this website**. Model agreement produces a suggestion, never a certified final score. Two passes from the same model can share mistakes. Independent examiner-marked proofs are required to measure accuracy; the authored smoke fixtures are not an expert benchmark. See the grader repository for configuration and evaluation instructions.

Answers, drafts, bookmarks and reviews live in this browser's local storage, without cross-device sync or server backup. Export backups from Your progress. Reviewer names are user-entered and unverified. Worked solutions are included in the public app code: this is a learning workspace, not a secure exam system or a source of certified grades.
