# Avenquellis native question service

This directory contains the pinned C++20 WebAssembly reactor used by the Pages generation and grading endpoints. The Worker imports a precompiled module and instantiates it once per isolate. The Node test loader reads the same file and verifies its recorded SHA-256. The adapter transports the inputs and returns JSON. Question generation, chapter assembly, mock assembly and saved-reference resolution execute in the C++ library.

[manifest.json](manifest.json) records source commit `783719e6134d71a77d49f7a2f98cb7988a614e04`. No branch of the question-engine repository contains that commit. Its release commit `032c25471e1577b67a3fcd9c1110e3080fbdccac`, which produced this distribution, says the module was built from `7cb213f3d6680bf3b430becf897e9acebf77f74e`, and that commit's `edge/adapter.mjs` has the adapter hash the manifest records. Check out `7cb213f3d6680bf3b430becf897e9acebf77f74e` to reproduce the build, until the manifest is corrected in that repository and synchronized here. Emscripten 6.0.13 produced the 237,076-byte module at ABI version 1. The exact hashes and import table are in [manifest.json](manifest.json). The checked-in distribution and build verification are available in the private repository. [Generator distribution](https://github.com/TARUNTEjjjj/avenquellis-question-engine/tree/main/release/edge) · [Verified build](https://github.com/TARUNTEjjjj/avenquellis-question-engine/actions/runs/41735479816)

`POST /api/generate` accepts a same-origin JSON request up to 4 KiB. The three modes are `question`, `chapter` and `mock`. Options may include `topic`, `difficulty`, `exam`, `type`, `count` and `seed`. A successful response contains `engine: "cpp-wasm"` and a `result` matching the question or mock schema. Invalid requests return a structured error.

Run the handler tests with `node --test tests/native-generation.test.js`. To compare the actual local Pages runtime with the native CLI, start Wrangler Pages locally and run the following from the web repo.

```sh
node scripts/check-native-pages.mjs http://127.0.0.1:8788 /path/to/avenquellis-questions
```
