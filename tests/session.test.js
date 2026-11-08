import test from 'node:test';
import assert from 'node:assert/strict';
import {configureExactChecker, parseNumber, gradeNumeric, checkNumericResponse, makeSession, remainingSeconds, finishSession, validSession} from '../dist/lib/session.js';

const mock = {id:'test',title:'Test session',durationMinutes:2,questions:[{id:'n1',statement:'Find one half.',topic:'probability',type:'numeric',answer:'1/2',maxMarks:4},{id:'p1',statement:'Prove the claim.',topic:'algebra',type:'proof',maxMarks:10}]};

test('numeric answers accept equivalent decimals and fractions', () => {
  assert.equal(parseNumber('  -3 / 6 '), -0.5);
  assert.equal(parseNumber('.5'), 0.5);
  assert.equal(parseNumber('+2.0'), 2);
  assert.equal(parseNumber('0/3'), 0);
  assert.ok(gradeNumeric('2/4','1/2'));
  assert.ok(gradeNumeric('0.5','1/2'));
  assert.equal(gradeNumeric('1/3','1/2'), false);
});

test('malformed numeric inputs and zero denominators cannot earn credit', () => {
  for (const value of ['', ' ', null, undefined, '1/0', '0/0', '1/-0', 'Infinity', 'NaN', '1/2/3', '1 + 1', '2abc', '<script>', '1e3']) {
    assert.equal(parseNumber(value), null, String(value));
    assert.equal(gradeNumeric(value,'0'), false, String(value));
  }
  assert.equal(gradeNumeric('1','1/0'), false);
});

test('session deadlines survive serialization and expire without extending time', () => {
  const start = 100000;
  const session = makeSession(mock,start);
  assert.equal(session.deadline,start + 120000);
  assert.equal(remainingSeconds(session,start),120);
  const resumed = JSON.parse(JSON.stringify(session));
  assert.ok(validSession(resumed));
  assert.equal(remainingSeconds(resumed,start + 30000),90);
  assert.equal(remainingSeconds(resumed,start + 119999),1);
  assert.equal(remainingSeconds(resumed,start + 120000),0);
  assert.equal(remainingSeconds(resumed,start + 121000),0);
});

test('finishing checks numeric answers while keeping proof marks pending', () => {
  const session = makeSession(mock,100000);
  session.answers = {n1:'2/4',p1:'A full-looking proof still needs review.'};
  const result = finishSession(session,160000);
  assert.equal(result.status,'completed');
  assert.equal(result.finishedAt,160000);
  assert.equal(result.results[0].score,4);
  assert.equal(result.results[0].status,'auto_checked');
  assert.equal(result.results[1].score,null);
  assert.equal(result.results[1].status,'needs_review');
  assert.equal(session.status,'active', 'Finishing must not mutate the saved input');
  assert.equal(validSession(result),false);
  const unanswered = finishSession(makeSession(mock,0),120000);
  assert.equal(unanswered.results[0].score,0);
  assert.equal(unanswered.results[1].score,null);
});

test('resume rejects incomplete and corrupted session shapes', () => {
  const good = makeSession(mock,100000);
  for (const value of [null,{}, {...good,status:'completed'}, {...good,questions:[]}, {...good,questions:[null]}, {...good,questions:[{id:'a'}]}, {...good,deadline:Infinity}, {...good,current:-1}, {...good,current:2}, {...good,current:0.5}, {...good,answers:null}, {...good,flags:null}]) assert.ok(!validSession(value));
  assert.ok(validSession(good));
});

test('unavailable compiled checker keeps unsupported arithmetic pending instead of wrong',()=>{
 for(const value of ['1-1','1/2/3','(1+1)/2']){assert.equal(checkNumericResponse(value,'0').unavailable,true,value);const s=makeSession(mock,0);s.answers.n1=value;const r=finishSession(s,1).results[0];assert.equal(r.score,null);assert.equal(r.status,'checker_unavailable');}
 assert.equal(checkNumericResponse('1/0','0').unavailable,undefined);assert.equal(checkNumericResponse('1/0','0').ok,false);
});

test('checker failures and invalid answer keys never turn into zero marks',()=>{
 try {
  const s=makeSession(mock,0);s.answers.n1='1/2';
  for(const result of [{ok:false,code:'engine_unavailable',error:'Runtime failed'},{ok:false,side:'right',error:'Invalid trusted answer'},null,{ok:false,error:'Unclassified failure'}]){
   configureExactChecker(()=>result);const checked=finishSession(s,1).results[0];assert.equal(checked.score,null);assert.equal(checked.status,'checker_unavailable');
  }
  configureExactChecker(()=>({ok:false,side:'left',error:'Division by zero'}));assert.equal(finishSession(s,1).results[0].score,0);
 }finally{configureExactChecker(null);}
});

test('malformed successful checker responses keep marks pending instead of marking wrong',()=>{
 try {
  const s=makeSession(mock,0);s.answers.n1='1/2';
  for(const result of [{ok:true},{ok:true,equivalent:null},{ok:true,equivalent:'false'},{ok:true,equivalent:1}]){
   configureExactChecker(()=>result);const checked=finishSession(s,1).results[0];
   assert.equal(checked.score,null);assert.equal(checked.status,'checker_unavailable');
  }
 }finally{configureExactChecker(null);}
});

test('fallback refuses an unreadable answer key without penalizing the learner',()=>{
 configureExactChecker(null);
 for(const expected of ['1/0','2+2','not a key']){
  const s=makeSession({...mock,questions:[{...mock.questions[0],answer:expected}]},0);s.answers.n1='1/2';
  const checked=finishSession(s,1).results[0];assert.equal(checked.score,null);assert.equal(checked.status,'checker_unavailable');
 }
 assert.equal(checkNumericResponse('bad answer','1/2').unavailable,undefined);
});
