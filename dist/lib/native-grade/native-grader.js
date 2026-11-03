import {instantiateGrader} from './runtime.js';
let loading;
export function preloadNativeGrader(){
  if(!loading)loading=(async()=>{
    const response=await fetch(new URL('./avenquellis-grader-runtime.wasm',import.meta.url));
    if(!response.ok)throw new Error('Native proof checker could not load.');
    return instantiateGrader(await response.arrayBuffer());
  })().catch(error=>{loading=undefined;throw error;});
  return loading;
}
export async function assessNative(question,answer){return (await preloadNativeGrader()).assess(question,answer);}
