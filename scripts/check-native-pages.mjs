/** Run against a local Wrangler Pages/workerd instance. No deploy or inference calls. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const [address,cli]=process.argv.slice(2);
if(!address||!cli)throw Error('Usage: node scripts/check-native-pages.mjs http://127.0.0.1:PORT /path/to/avenquellis-questions');
const origin=new URL(address);
if(!['127.0.0.1','localhost','[::1]'].includes(origin.hostname)||origin.protocol!=='http:')throw Error('Use a local HTTP workerd instance.');
const endpoint=new URL('/api/generate',origin);
const cases=[
  [{mode:'question',exam:'ISI',topic:'geometry',seed:'工作😀'},['question','--exam','ISI','--topic','geometry','--seed','工作😀']],
  [{mode:'chapter',topic:'number-theory',exam:'RMO',count:12,seed:42},['chapter','--topic','number-theory','--exam','RMO','--count','12','--seed-number','42']],
  [{mode:'mock',topic:'all',exam:'CMI',count:18,seed:'full'},['mock','--topic','all','--exam','CMI','--count','18','--seed','full']],
];
async function send(body) {
  return fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin.origin},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
}
for(const [body,args] of cases) {
  const response=await send(body);
  assert.equal(response.status,200);
  const {engine,result}=await response.json();
  assert.equal(engine,'cpp-wasm');
  assert.deepEqual(result,JSON.parse(execFileSync(cli,args,{encoding:'utf8',maxBuffer:512*1024})));
}
for(const body of [{mode:'chapter',topic:'all'},{mode:'mock',topic:'geometry',type:'numeric',count:10},{mode:'mock',topic:'calculus',type:'proof',count:30}]) {
  const response=await send(body);
  assert.equal(response.status,400);
  assert.equal((await response.json()).error.code,'invalid_input');
}
console.log('Verified compiled Pages generation across question, chapter, mock and invalid selection, against the native CLI.');
