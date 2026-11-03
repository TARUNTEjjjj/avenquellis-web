import createAxiomMath from './axiom-math-runtime.js';

export const exactMathInfo=Object.freeze({
  name:'AxiomMath',version:'ae5b38257b7825db603ecd5c7b28ade32c1a613f',
  implementation:'C++20 compiled to WebAssembly',
  source:'https://github.com/TARUNTEjjjj/axiom-math',
  limits:Object.freeze({expressionBytes:4096,tokens:1024,nesting:64,integerDigits:19,fractionalDigits:18}),
  grammar:'Integers, finite decimals, +, -, *, /, unary signs and parentheses.',
  notice:'Exact bounded rational arithmetic. This checks arithmetic equality, not symbolic identities or mathematical proofs.'
});
let moduleInstance=null,initialization=null;
/** Load and instantiate the real compiled C++ engine once. Rejects on load failure. */
export async function initExactMath(){
  if(moduleInstance)return exactMathInfo;
  if(!initialization)initialization=createAxiomMath({locateFile:path=>new URL(path,import.meta.url).href})
    .then(instance=>{moduleInstance=instance;return exactMathInfo;})
    .catch(error=>{initialization=null;throw error;});
  return initialization;
}
const encoder=new TextEncoder();
function prepare(value){
  if(typeof value!=='string')return {error:'Expression must be a string.'};
  // Reject embedded NUL rather than permit C-string conversion to truncate it.
  if(value.includes('\0'))return {error:'NUL characters are not valid expression input.',position:encoder.encode(value.slice(0,value.indexOf('\0'))).length};
  const length=encoder.encode(value).length;
  if(length>4096)return {error:'Expression exceeds the 4096-byte limit.',position:4096};
  return {length};
}
function invoke(name,args,types){
  if(!moduleInstance)return {ok:false,code:'engine_unavailable',error:'Exact engine is not ready. Await initExactMath() first.'};
  try{return JSON.parse(moduleInstance.ccall(name,'string',types,args));}
  catch{return {ok:false,code:'engine_unavailable',error:'The exact arithmetic engine could not complete this request.'};}
}
/** Synchronous after initialization; value is an exact reduced fraction string. */
export function evaluateExact(expression){
  const input=prepare(expression);if(input.error)return {ok:false,...input};
  return invoke('axiom_evaluate',[expression,input.length],['string','number']);
}
/** Synchronous exact comparison. No floating-point tolerance is applied. */
export function checkExact(left,right){
  const a=prepare(left);if(a.error)return {ok:false,...a,side:'left'};
  const b=prepare(right);if(b.error)return {ok:false,...b,side:'right'};
  return invoke('axiom_check',[left,a.length,right,b.length],['string','number','string','number']);
}
