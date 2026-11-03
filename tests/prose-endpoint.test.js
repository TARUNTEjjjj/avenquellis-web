import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/grade.js';
import {questionBank, generateMock} from '../dist/lib/questions.js';
const base='https://avenquellis.pages.dev';
const bank=questionBank.find(q=>q.type==='proof');
const proof='Every common divisor of n and n+k also divides their difference k.';
const makeRequest=(body,client,origin=base)=>new Request(base+'/api/grade',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'CF-Connecting-IP':client},body:JSON.stringify(body)});
const settings={AVENQUELLIS_HOSTED_GRADING:'enabled',EVALUATOR_MODEL:'@cf/meta/llama-3.3-70b-instruct-fp8-fast'};
test('live route resolves canonical rubrics, returns two evidence-backed readings and cools down requests',async()=>{
 let called=0;const q=generateMock({seed:'prose-e2e',type:'proof',count:6}).questions[0];
 const env={...settings,AI:{run:async()=>{called++;return {response:{criterionScores:Object.fromEntries(q.rubric.map(c=>[c.id,c.points])),evidence:q.rubric.map(c=>({criterionId:c.id,quote:proof})),rationale:'Test transport response',gaps:[]}};}}};
 const body={questionId:q.id,reference:{templateId:q.templateId,seed:q.generator.seed,exam:q.exam,difficulty:q.requestedDifficulty},answer:proof};
 const response=await onRequest({request:makeRequest(body,'192.0.2.2'),env});assert.equal(response.status,200);const r=await response.json();assert.equal(called,2);assert.equal(r.suggestedScore,10);assert.equal(r.score,null);assert.equal(r.provenance.provider,'workers-ai');assert.equal(r.criterionProposals.length,q.rubric.length);
 const again=await onRequest({request:makeRequest(body,'192.0.2.2'),env});assert.equal(again.status,429);assert.equal(called,2);
});
test('rejects foreign origins, disabled hosting, client-supplied rubrics and blank proofs before inference',async()=>{
 const env={...settings,AI:{run:async()=>{throw Error('inference should never run');}}};const body={questionId:bank.id,answer:proof};
 for(const [input,origin,environment,expected] of [[body,'https://other.example',env,403],[body,base,{...env,AVENQUELLIS_HOSTED_GRADING:'disabled'},503],[{...body,rubric:[]},base,env,400],[{...body,answer:' '},base,env,400],[{...body,reference:{solution:'forged'}},base,env,404]])assert.equal((await onRequest({request:makeRequest(input,'192.0.2.3',origin),env:environment})).status,expected);
});
