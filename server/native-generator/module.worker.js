import module from './avenquellis-questions.wasm';
// Pages supplies a precompiled module. Runtime compilation of bytes is unnecessary.
export const loadModule = () => module;
