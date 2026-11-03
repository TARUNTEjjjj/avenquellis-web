import createAvenquellisGrader from './avenquellis-grader-runtime.js';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
export const NATIVE_GRADER_VERSION='avenquellis-grader-wasm/1';

export async function instantiateGrader(moduleOrBytes){
  const compiled=moduleOrBytes instanceof WebAssembly.Module?moduleOrBytes:await WebAssembly.compile(moduleOrBytes);
  const native=await createAvenquellisGrader({instantiateWasm(imports,ready){
    const instance=new WebAssembly.Instance(compiled,imports);
    ready(instance,compiled);
    return instance.exports;
  }});
  function invoke(action,data){
    const input=encoder.encode(JSON.stringify(data));
    if(input.length>1048576)throw new RangeError('Native grading request exceeds 1 MiB.');
    const ptr=native._malloc(Math.max(1,input.length));
    if(!ptr)throw new Error('Native grading memory unavailable.');
    try {
      native.HEAPU8.set(input,ptr);
      const output=native._avenquellis_grader_run(action,ptr,input.length);
      const size=native._avenquellis_grader_output_length();
      if(!output||size>2097152)throw new Error('Invalid native grading output.');
      const result=JSON.parse(decoder.decode(native.HEAPU8.subarray(output,output+size)));
      if(result.error)throw new TypeError(result.error);
      return {...result,provenance:{nativeGrader:NATIVE_GRADER_VERSION}};
    } finally {
      native.HEAPU8.fill(0,ptr,ptr+input.length);
      native._avenquellis_grader_clear();
      native._free(ptr);
    }
  }
  return Object.freeze({assess:(question,answer)=>invoke(1,{question,answer}),scaffold:question=>invoke(2,{question}).scaffold,
    compare:(question,answer,reviews)=>invoke(3,{question,answer,reviews})});
}
