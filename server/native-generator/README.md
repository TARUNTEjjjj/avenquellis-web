# Avenquellis native question service

This directory contains the pinned C++20 WebAssembly reactor used by the Pages generation and grading endpoints. The Worker imports a precompiled module and instantiates it once per isolate. The Node test loader reads the same file and verifies its recorded SHA-256. The adapter transports the inputs and returns JSON. Question generation, chapter assembly, mock assembly and saved-reference resolution execute in the C++ library.

[manifest.json](manifest.json) records source commit `d8cbddf82742ccbe83b8bd17710350054c8bfaa3`, which the question-engine `main` branch contains (merged by `c9deeff1e8a4fbb563cdfd9570a3274825e5866f`). The engine's edge workflow built this distribution from that commit with Emscripten 6.0.13 ([run 43709615616](https://github.com/TARUNTEjjjj/avenquellis-question-engine/actions/runs/43709615616)), and its release commit `7d4c191a8506a96220cc85c6ad12a0d1a893e6bb` checked it in. Emscripten 6.0.13 produced the 238,117-byte module at ABI version 1. The exact hashes and import table are in [manifest.json](manifest.json). Building the same sources locally with the workflow's pinned emsdk (commit `d7b4130688bfa348392b921ab04015aa15c4f154`) reproduced the module and adapter byte for byte. [Generator distribution](https://github.com/TARUNTEjjjj/avenquellis-question-engine/tree/main/release/edge)

This adapter accepts a saved reference's content `version` and passes it to the C++ resolver, which reconstructs a question only while its family still has that version. A reference without a `version`, which every client before this release sent, names version 0.1.0, so earlier saved work still resolves. The adapter had to ship before the app began sending `version`: earlier adapters returned `null` for any reference with a `version` key.

`POST /api/generate` accepts a same-origin JSON request up to 4 KiB. The three modes are `question`, `chapter` and `mock`. Options may include `topic`, `difficulty`, `exam`, `type`, `count` and `seed`. A successful response contains `engine: "cpp-wasm"` and a `result` matching the question or mock schema. Invalid requests return a structured error.

Run the handler tests with `node --test tests/native-generation.test.js`. To compare the actual local Pages runtime with the native CLI, start Wrangler Pages locally and run the following from the web repo.

```sh
node scripts/check-native-pages.mjs http://127.0.0.1:8788 /path/to/avenquellis-questions
```
