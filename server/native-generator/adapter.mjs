/** ABI v1: transport only. Every selection, seed draw, rubric and mock is produced in C++. */
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal:true});
const modes = {question:1,mock:2,chapter:3};
const optionKeys = new Set(['mode','topic','exam','difficulty','type','seed','count']);
const refKeys = new Set(['id','templateId','seed','exam','difficulty','version']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [null,Object.prototype].includes(Object.getPrototypeOf(value));
const fail = message => { throw Object.assign(new Error(message),{code:'invalid_input'}); };
const flag = (value, fallback) => value === undefined ? fallback :
  typeof value === 'string' && value.length<=64 ? value : fail('A selector must be a string of up to 64 characters.');
function wellFormed(text) {
  for(let i=0;i<text.length;++i) {
    const unit=text.charCodeAt(i);
    if(unit>=0xd800 && unit<=0xdbff){const next=text.charCodeAt(++i);if(!(next>=0xdc00 && next<=0xdfff))return false;}
    else if(unit>=0xdc00 && unit<=0xdfff)return false;
  }
  return true;
}

export function createNativeGenerator(module) {
  // Emscripten libc++ may inspect the process environment while initializing.
  // Supply an empty WASI environment. The reactor never owns host descriptors.
  let memory;
  const wasi={
    fd_close:()=>8, // WASI BADF
    environ_sizes_get:(entries, bytes)=>{
      const view=new DataView(memory.buffer);
      view.setUint32(entries,0,true);
      view.setUint32(bytes,0,true);
      return 0;
    },
    environ_get:()=>0
  };
  const instance=new WebAssembly.Instance(module,{wasi_snapshot_preview1:wasi});
  const abi=instance.exports;
  memory=abi.memory;
  abi._initialize();
  if(abi.avenquellis_abi_version()!==1)throw Error('Unsupported native generator ABI.');
  function invoke(op,fields) {
    const bytes = fields.map(value=>value===undefined?null:encoder.encode(value));
    const length=bytes.reduce((sum,b)=>sum+2+(b?.length||0),0);
    if(length>abi.avenquellis_capacity())fail('Request exceeds generator input capacity.');
    const start=abi.avenquellis_input();
    const data=new Uint8Array(abi.memory.buffer,start,length);
    let offset=0;
    for(const value of bytes) {
      const n=value===null?65535:value.length;
      data[offset++]=n&255;data[offset++]=n>>>8;
      if(value!==null){data.set(value,offset);offset+=n;}
    }
    // Synchronous copy and invocation: no input view is shared across awaits.
    const status=abi.avenquellis_call(op,length), size=abi.avenquellis_output_size();
    if(size>1024*1024)throw Error('Native output exceeds the response limit.');
    const text=decoder.decode(new Uint8Array(abi.memory.buffer,abi.avenquellis_output(),size));
    if(status===1)fail(text);
    if(status!==0)throw Error('Native generation failed.');
    return JSON.parse(text);
  }
  return {
    generate(options) {
      if(!record(options)||Object.keys(options).some(k=>!optionKeys.has(k))||typeof options.mode!=='string'||!Object.hasOwn(modes,options.mode))
        fail('Use question, chapter or mock mode with supported fields.');
      const seed=options.seed===undefined?1:options.seed,count=options.count===undefined?6:options.count;
      // Same limit and message as src/index.js and the native engine.
      if(typeof seed==='string'&&seed.length>249)fail('Seed is too long for a 256-unit question reference.');
      if(typeof seed==='string' ? !wellFormed(seed) : !Number.isSafeInteger(seed))fail('Use a valid text seed or a safe integer.');
      if(!Number.isInteger(count)||count<1||count>30)fail('Count must be from 1 to 30.');
      return invoke(modes[options.mode],[flag(options.topic,'all'),flag(options.exam,'CMI'),flag(options.difficulty,'advanced'),flag(options.type,'all'),typeof seed,String(seed),String(count)]);
    },
    resolve(ref) {
      if(!record(ref)||Object.keys(ref).some(k=>!refKeys.has(k))||typeof ref.id!=='string'||ref.id.length>160)return null;
      // The content version follows as a sixth field only when the reference has one.
      const fields=[ref.id,ref.templateId,ref.seed,ref.exam,ref.difficulty,...(ref.version===undefined?[]:[ref.version])];
      if(fields.some(s=>s!==undefined && (typeof s!=='string'||s.length>256||!wellFormed(s))))return null;
      return invoke(4,fields);
    },
    bank(){return invoke(5,[]);}
  };
}
