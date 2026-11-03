import {readFile} from 'node:fs/promises';
export async function loadGraderModule(){
  return WebAssembly.compile(await readFile(new URL('../../dist/lib/native-grade/avenquellis-grader-runtime.wasm',import.meta.url)));
}
