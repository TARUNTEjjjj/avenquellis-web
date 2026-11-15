import {getNativeGenerator} from '../../server/native-generator/index.js';

const maxBody = 4096;
const respond = (body,status=200,extra={}) => Response.json(body,{
  status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}
});
const error = (status,code,message,extra) => respond({error:{code,message}},status,extra);

async function input(request, timeoutMs) {
  if(Number(request.headers.get('content-length'))>maxBody){
    void request.body?.cancel().catch(()=>{});
    throw Object.assign(Error('Request exceeds 4096 bytes.'),{status:413});
  }
  const reader=request.body?.getReader();
  if(!reader)throw Error('Send a JSON object.');
  const chunks=[];
  let total=0,timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('Request body timed out.'),{status:408})),timeoutMs);});
  try {
    for(;;) {
      const {done,value}=await Promise.race([reader.read(),deadline]);
      if(done)break;
      total+=value.byteLength;
      if(total>maxBody)throw Object.assign(Error('Request exceeds 4096 bytes.'),{status:413});
      chunks.push(value);
    }
  } catch(reason) {
    // A stream may never settle its cancellation. Never hold the response for cleanup.
    void reader.cancel().catch(()=>{});
    throw reason;
  } finally {clearTimeout(timer);reader.releaseLock();}
  const bytes=new Uint8Array(total);
  let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}

export function createGenerationHandler({bodyTimeoutMs=10000}={}) {
  if(!Number.isFinite(bodyTimeoutMs)||bodyTimeoutMs<=0)throw new RangeError('Use a positive request timeout.');
  return async function onRequest({request}) {
  if(request.method!=='POST')return error(405,'method_not_allowed','Use POST.',{Allow:'POST'});
  const origin=request.headers.get('origin');
  if(origin && origin!==new URL(request.url).origin)return error(403,'origin_not_allowed','Origin not allowed.');
  const type=(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(type!=='application/json')return error(415,'unsupported_media_type','Send application/json.');
  let body;
  try{body=await input(request,bodyTimeoutMs);}
  catch(reason){
    if(reason.status===413)return error(413,'payload_too_large',reason.message);
    if(reason.status===408)return error(408,'request_timeout','Send the complete request within the upload deadline.');
    return error(400,'invalid_input','Send valid UTF-8 JSON.');
  }
  try{
    const engine=await getNativeGenerator();
    return respond({engine:'cpp-wasm',result:engine.generate(body)});
  }catch(reason){
    if(reason.code==='invalid_input')return error(400,'invalid_input',reason.message);
    return error(503,'engine_unavailable','The native generator is unavailable. Try again later.');
  }
  };
}

export const onRequest=createGenerationHandler();
