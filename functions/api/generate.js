import {getNativeGenerator} from '../../server/native-generator/index.js';

const maxBody = 4096;
const respond = (body,status=200,extra={}) => Response.json(body,{
  status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}
});
const error = (status,code,message,extra) => respond({error:{code,message}},status,extra);

async function input(request) {
  if(Number(request.headers.get('content-length'))>maxBody)throw Object.assign(Error('Request exceeds 4096 bytes.'),{status:413});
  const reader=request.body?.getReader();
  if(!reader)throw Error('Send a JSON object.');
  const chunks=[];
  let total=0;
  try {
    for(;;) {
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>maxBody){await reader.cancel();throw Object.assign(Error('Request exceeds 4096 bytes.'),{status:413});}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(total);
  let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}

export async function onRequest({request}) {
  if(request.method!=='POST')return error(405,'method_not_allowed','Use POST.',{Allow:'POST'});
  const origin=request.headers.get('origin');
  if(origin && origin!==new URL(request.url).origin)return error(403,'origin_not_allowed','Origin not allowed.');
  const type=(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(type!=='application/json')return error(415,'unsupported_media_type','Send application/json.');
  let body;
  try{body=await input(request);}
  catch(reason){return reason.status===413?error(413,'payload_too_large',reason.message):error(400,'invalid_input','Send valid UTF-8 JSON.');}
  try{
    const engine=await getNativeGenerator();
    return respond({engine:'cpp-wasm',result:engine.generate(body)});
  }catch(reason){
    if(reason.code==='invalid_input')return error(400,'invalid_input',reason.message);
    return error(503,'engine_unavailable','The native generator is unavailable. Try again later.');
  }
}
