import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/generate.js';
import {getNativeGenerator} from '../server/native-generator/index.js';
import {generateQuestion,generateMock} from '../dist/lib/questions.js';

const base='https://avenquellis.pages.dev';
const post=(body,headers={})=>onRequest({request:new Request(base+'/api/generate',{
  method:'POST',headers:{'Content-Type':'application/json',Origin:base,...headers},body:JSON.stringify(body)
})});
test('Pages endpoint returns actual C++ questions, chapter sections, and full mocks',async()=>{
  for(const [mode,opts] of [
    ['question',{topic:'algebra',difficulty:'olympiad',exam:'ISI',seed:'😀'.repeat(65)}],
    ['chapter',{topic:'number-theory',exam:'RMO',seed:42,count:12}],
    ['mock',{topic:'all',exam:'CMI',seed:'full',count:18}]
  ]) {
    const response=await post({mode,...opts});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.engine,'cpp-wasm');
    assert.deepEqual(body.result,mode==='question'?generateQuestion(opts):generateMock(opts));
    const q=mode==='question'?body.result:body.result.questions[0];
    const engine=await getNativeGenerator();
    assert.deepEqual(engine.resolve({id:q.id,templateId:q.templateId,seed:q.generator.seed,exam:q.exam,difficulty:q.requestedDifficulty}),q);
    assert.equal(engine.resolve({id:q.id,solution:'untrusted'}),null);
  }
});
test('validates request transport, disallows forged options and recovers after a native C++ error',async()=>{
  for(const [body,status] of [
    [{mode:'question',solution:'override'},400],[{mode:'chapter',topic:'all'},400],
    [{mode:'mock',type:'numeric',topic:'geometry',count:10},400],[{mode:'question',seed:{x:1}},400],
    [{mode:'question',seed:'\ud800'},400],[{mode:'question',seed:1e20},400],[{mode:'question',x:'x'.repeat(5000)},413],
    [{mode:'question',exam:'RMO',type:'numeric'},400],
  ])assert.equal((await post(body)).status,status);
  assert.equal((await post({mode:'question'},{Origin:'https://other.example'})).status,403);
  assert.equal((await post({mode:'question'},{'Content-Type':'text/plain'})).status,415);
  assert.equal((await onRequest({request:new Request(base+'/api/generate')})).status,405);
  const recovered=await post({mode:'question',seed:'after-invalid'});
  assert.equal(recovered.status,200);
});
test('an over-long seed gets the JavaScript and native C++ message from the endpoint',async()=>{
  const seed='a'.repeat(250),response=await post({mode:'question',seed});
  assert.equal(response.status,400);
  const {error}=await response.json();
  assert.equal(error.code,'invalid_input');
  assert.throws(()=>generateQuestion({seed}),{message:error.message});
});
