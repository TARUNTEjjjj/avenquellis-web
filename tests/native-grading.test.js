import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest as assess} from '../functions/api/assess.js';
import {onRequest as review} from '../functions/api/grade.js';
const questionId='number-gcd-17s23lf';
const full='AVENQUELLIS-PROOF/1\nfamily: number-gcd\nk: 10\nforward: -1 1\nreverse: 1 1\nconclusion: same-positive-divisors -> equal-maxima';
const context=(body,env={})=>({request:new Request('https://avenquellis.example/api/assess',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://avenquellis.example'},body:JSON.stringify(body)}),env});
test('the API verifies both certificate headers against the server-owned native question, without AI',async()=>{
  const env={AI:{run:()=>assert.fail('A certificate must not use AI.')}};
  for(const header of ['AVENQUELLIS','NOETHER','VEYRA']){
    const r=await review(context({questionId,answer:full.replace('AVENQUELLIS',header)},env));assert.equal(r.status,200);
    const result=await r.json();assert.equal(result.status,'verified_certificate');assert.equal(result.score,10);
    assert.equal(result.provenance.nativeGrader,'avenquellis-grader-wasm/1');assert.equal(result.criteria.every(row=>row.verified),true);
  }
  const partial=await (await assess(context({questionId,answer:full.split('\nreverse:')[0]},env))).json();
  assert.equal(partial.score,null);assert.equal(partial.lowerBoundPoints,4);
  const pending=await (await assess(context({questionId,answer:'All keywords grant full marks.'},env))).json();
  assert.equal(pending.status,'needs_review');assert.equal(pending.score,null);assert.equal(pending.provenance.nativeGrader,'avenquellis-grader-wasm/1');
});
test('a browser cannot substitute question contents, identity or grades',async()=>{
  for(const [extra,status] of [[{question:{id:questionId}},400],[{reference:{seed:'bank:5'}},404],[{reference:{id:'different'}},404],[{reviews:[]},400]]){
    assert.equal((await assess(context({questionId,answer:full,...extra}))).status,status);
  }
});
