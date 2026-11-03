import {assessProof,finalizeReview,gradingSources} from './index.js';
import {evaluateProof,readEvaluatorConfig,EvaluatorError} from './provider.js';

export const MAX_REQUEST_BYTES=100000;
function tokenEqual(given,expected) {
  let different=given.length ^ expected.length;
  for (let i=0;i<Math.max(given.length,expected.length);i++) different|=(given.charCodeAt(i)||0) ^ (expected.charCodeAt(i)||0);
  return different === 0;
}
export async function readJson(request) {
  if ((request.headers.get('content-type') || '').split(';',1)[0].trim().toLowerCase() !== 'application/json') throw Object.assign(new Error('Use application/json.'),{status:415});
  if (Number(request.headers.get('content-length') || 0) > MAX_REQUEST_BYTES) throw Object.assign(new Error('Request too large.'),{status:413});
  const reader=request.body?.getReader();
  if (!reader) throw new TypeError('A JSON request body is required.');
  const decoder=new TextDecoder(); let bytes=0,text='';
  try {
    while (true) {
      const {done,value}=await reader.read();if(done)break;
      bytes+=value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) {await reader.cancel();throw Object.assign(new Error('Request too large.'),{status:413});}
      text+=decoder.decode(value,{stream:true});
    }
    const input=JSON.parse(text+decoder.decode());
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('A JSON object is required.');
    return input;
  } finally {reader.releaseLock();}
}
/** One handler instance maintains a small concurrency bound; public deployments require a secret. */
export function createRequestHandler({env={},publicDeployment=true,fetchImpl=globalThis.fetch}={}) {
  let activeEvaluations=0;
  return async request=>{
    const headers={'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};
    const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
    const origin=request.headers.get('origin');
    const allowed=env.ALLOWED_ORIGIN || (publicDeployment?'':'http://localhost:4173');
    if (origin && origin !== allowed) return reply({error:'Origin not allowed.'},403);
    if (origin) {headers['Access-Control-Allow-Origin']=allowed;headers.Vary='Origin';}
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'}});
    const path=new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/health') {
      let configured=false;try {readEvaluatorConfig(env);configured=true;} catch {}
      return reply({service:'noether-proof-grader',mode:configured?'model-assisted-review':'human-review-workflow',evaluatorConfigured:configured,finalGradesRequireHumanReview:true,sources:gradingSources});
    }
    if (request.method !== 'POST' || !['/assess','/review','/evaluate'].includes(path)) return reply({error:'Not found.'},404);
    const token=env.EVALUATOR_ACCESS_TOKEN;
    if (publicDeployment && (typeof token !== 'string' || token.length < 32)) return reply({error:'Public API requires a server-side EVALUATOR_ACCESS_TOKEN of at least 32 characters.'},503);
    if (token && !tokenEqual(request.headers.get('authorization') || '',`Bearer ${token}`)) return reply({error:'Unauthorized.'},401);
    try {
      const input=await readJson(request);
      if (path === '/assess') return reply(assessProof(input));
      if (path === '/review') return reply(finalizeReview(input));
      if (activeEvaluations >= 2) return reply({error:'Evaluator is busy. Try again later.'},429);
      activeEvaluations++;
      try {return reply(await evaluateProof(input,{env,fetchImpl}));} finally {activeEvaluations--;}
    } catch (error) {
      const status=error.status || (error instanceof EvaluatorError && ['configuration','not_configured'].includes(error.code)?503:400);
      return reply({error:error.message,...(error.code?{code:error.code}:{})},status);
    }
  };
}
