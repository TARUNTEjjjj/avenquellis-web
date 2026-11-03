# Noether mathematics lab

A static 3D practice workspace for CMI, ISI and school-level mathematical olympiad preparation. The application connects a question bank, timed practice, a chapter library, question generation, proof review preparation and device-local progress.

## Run locally

Requires Node.js 20 or newer. No package installation is needed.

```sh
npm start
```

Open `http://127.0.0.1:4173`. `PORT=4180 npm start` selects another local port. The development server binds to loopback and serves only `dist/`; it is not a production authentication service.

```sh
npm test
npm run build
```

The build command validates JavaScript syntax, required assets and archive references. This project is buildless: deploy the existing `dist/` directory to a static host. Run it through HTTP rather than opening `index.html` as a `file://` URL, because browser modules and archive fetching require a suitable origin.

## Three-repository architecture

| Repository | Responsibility |
| --- | --- |
| `noether-web` | UI, 3D scene, timed sessions, local progress and official-paper reference catalog |
| `noether-question-engine` | Deterministic original question templates, solutions, rubrics and mock assembly |
| `noether-proof-grader` | Review preparation, structured evaluator proposal validation and recorded human marks |

The website imports browser-compatible copies of the engine modules from `dist/lib/`. The optional Node HTTP services in the engine repositories are separate from this static site. No browser API key or external model account is required for the shipped experience.

To update vendored modules, place all three repositories beside one another and run:

```sh
npm run sync:engines
npm test
npm run build
```

The synchronization script copies each sibling repository's `src/index.js` byte-for-byte and writes `dist/lib/vendor-provenance.json` with package versions and SHA-256 hashes. Do not edit vendored copies as the long-term source of truth.

## What the current version provides

- Original practice questions with reproducible seeds, worked solutions and problem-specific rubrics. The generator uses a finite collection of mathematical templates; parameter changes do not guarantee novel problems or calibrated entrance-exam difficulty.
- Timed sessions with a saved deadline. Reloading a valid saved session retains that deadline. Numeric answers support decimals and fractions and are checked against the known generated answer.
- Official CMI and RMO paper links, ISI sample-set links, and topic-tagged question references. `dist/archive.json` is a reference catalog, not a full transcription of previous-year papers. Read the original question in the linked PDF. Source labels distinguish official samples from past examination papers, and unknown timing or marks stay unknown.
- A proof workspace that prepares answers for review. It does not provide a validated automatic proof-correctness grader. Proof marks remain pending until an explicit review is recorded. Reviewer names are user-supplied and unverified; a saved name is not a credential or an institutional endorsement.
- Progress and answers retained in the current browser's local storage. Data is not synced between devices, encrypted by this app, or backed up to a server. Clearing browser storage removes the saved workspace. Private browsing and storage restrictions can affect persistence.

The core site works while served locally without an internet connection; optional Google Fonts fall back to system fonts offline. Opening official source PDFs requires internet access. There is no service worker guaranteeing that a hosted page will reopen offline after the browser closes.

## Sources and grading limits

Read [ARCHIVE-SOURCES.md](ARCHIVE-SOURCES.md) for paper provenance and format distinctions. The proof module records published IMO/UKMT guidance used to shape the review workflow; the separate grader repository documents the adaptations and an evaluation protocol. Published guidance is not evidence that this software matches CMI, ISI or olympiad human examiners.

A production grading service still requires authenticated reviewer roles, server-owned questions and rubrics, durable audit storage, a real evaluator integration if automated proposals are wanted, and measured agreement against independently marked student proofs. The shipped browser workspace must not be used as a secure exam platform or a source of certified grades.
