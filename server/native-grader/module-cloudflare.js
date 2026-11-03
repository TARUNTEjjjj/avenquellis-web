// Wrangler supplies a precompiled WebAssembly.Module. Workers never compile downloaded code.
import compiled from '../../dist/lib/native-grade/avenquellis-grader-runtime.wasm';
export function loadGraderModule(){return compiled;}
