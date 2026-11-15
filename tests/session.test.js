import test from 'node:test';
import assert from 'node:assert/strict';
import {configureExactChecker, parseNumber, gradeNumeric, checkNumericResponse, makeSession, remainingSeconds, finishSession, validSession, regradeAttempt, submissionTime, orderTimes, newAttemptId, distinctAttempts} from '../dist/lib/session.js';
import {questionBank} from '../dist/lib/questions.js';
import {certificateHelp, verifyCertificate} from '../dist/lib/certificate.js';

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

test('re-grading a saved attempt while the proof checker is unavailable keeps its verified marks',()=>{
 const q=questionBank.find(q=>q.templateId==='number-gcd');
 const full=certificateHelp(q).scaffold.replace('forward: _ _','forward: -1 1').replace('reverse: _ _','reverse: 1 1').replace('conclusion: _','conclusion: same-positive-divisors -> equal-maxima');
 const s=makeSession({id:'gcd',title:'Certificate',durationMinutes:20,questions:[q,mock.questions[0]]},1000);
 s.answers={[q.id]:full,n1:'1/2'};
 const saved=JSON.parse(JSON.stringify(finishSession(s,2000,verifyCertificate)));
 assert.equal(saved.results[0].status,'verified_certificate');
 const unavailable=()=>{throw Error('The proof checker is not loaded.');};
 assert.deepEqual(regradeAttempt(saved,unavailable).results,saved.results);
 // A loaded checker still decides, and the numeric answer is still checked.
 assert.equal(regradeAttempt(saved,()=>null).results[0].status,'needs_review');
 assert.equal(regradeAttempt(saved,verifyCertificate).results[0].score,q.maxMarks);
 assert.equal(regradeAttempt(saved,unavailable).results[1].score,4);
 // With no saved result to keep, the proof stays pending rather than gaining marks.
 const unsaved=regradeAttempt({...saved,results:undefined},unavailable).results[0];
 assert.equal(unsaved.status,'needs_review');assert.equal(unsaved.score,null);
});

test('a clock that steps back during a test never makes the submitted work invalid',()=>{
 const s=makeSession(mock,1000000),back=s.startedAt-300000;
 assert.equal(submissionTime(s,back),s.startedAt);
 assert.ok(validSession({...s,submittedAt:submissionTime(s,back)}));
 assert.equal(submissionTime(s,s.startedAt+5),s.startedAt+5);
 // Work an earlier release saved with times out of order is repaired when it is read.
 const stepped={...s,submittedAt:back};
 assert.equal(validSession(stepped),false);
 assert.deepEqual(orderTimes(stepped),{...s,submittedAt:s.startedAt});
 assert.ok(validSession(orderTimes(stepped)));
 assert.equal(orderTimes(finishSession(s,back)).finishedAt,s.startedAt);
 assert.equal(orderTimes(s),s);
 assert.equal(orderTimes(null),null);
});

test('two saved attempts never share an id, and repeated ids an earlier release saved are told apart',()=>{
 const random=Math.random,values=[0.5,0.5,0.25];
 Math.random=()=>values.shift();
 try{
  const first=newAttemptId(7);
  assert.match(first,/^attempt-7-[a-z0-9]+$/);
  // The same random draw again gives a used id, so another is drawn.
  assert.equal(newAttemptId(7,[first]),'attempt-7-'+(0.25).toString(36).slice(2,8));
 }finally{Math.random=random;}
 const s=makeSession(mock,1000),newer=finishSession({...s,answers:{n1:'1/2'}},3000),older=finishSession(s,2000);
 const other=finishSession(makeSession(mock,500),900);
 // A restored draft of a finished test, finished again under the same id (newest first, as saved).
 const fixed=distinctAttempts([newer,other,older]);
 assert.deepEqual(fixed.map(a=>a.attemptId),[s.attemptId+'-2',other.attemptId,s.attemptId]);
 assert.equal(fixed[0].answers.n1,'1/2','the newer attempt keeps its own work');
 assert.equal(fixed[2],older,'the older attempt is untouched');
 // Every tab derives the same ids, and a derived id never reuses one already saved.
 assert.deepEqual(distinctAttempts([newer,other,older]).map(a=>a.attemptId),fixed.map(a=>a.attemptId));
 const taken={...other,attemptId:s.attemptId+'-2'};
 assert.deepEqual(distinctAttempts([newer,taken,older]).map(a=>a.attemptId),[s.attemptId+'-3',s.attemptId+'-2',s.attemptId]);
 const long={...older,attemptId:'a'.repeat(200)};
 assert.ok(distinctAttempts([long,long]).every(a=>a.attemptId.length<=200));
 const distinct=[newer,other];
 assert.equal(distinctAttempts(distinct),distinct);
});

test('the literal fallback labels a number beyond its bounds too large to check: neither wrong nor left pending',()=>{
 configureExactChecker(null);
 const q={...mock.questions[0],answer:'4'};
 // Each equals 4: 19 fractional digits, 20 integer digits, a literal beyond 64 bits, more than 200 characters.
 for(const value of ['4.0000000000000000000','36893488147419103232/9223372036854775808','9223372036854775808/2305843009213693952','4'+' '.repeat(300)+'/1']){
  const check=checkNumericResponse(value,'4');
  assert.equal(check.unavailable,true,value.slice(0,40));assert.equal(check.beyondBounds,true);assert.match(check.error,/exceeds/);
  const s=makeSession({...mock,questions:[q]},0);s.answers.n1=value;const r=finishSession(s,1).results[0];
  assert.equal(r.score,null);assert.equal(r.status,'beyond_checker_bounds');
 }
 // A wrong number beyond the bounds gets the same label: no checker here can tell the two apart.
 {const s=makeSession({...mock,questions:[q]},0);s.answers.n1='99999999999999999999';const r=finishSession(s,1).results[0];
  assert.equal(r.score,null);assert.equal(r.status,'beyond_checker_bounds');}
 // An answer key the fallback cannot read is different: the C++ checker can decide it, so the answer waits.
 {const waiting=checkNumericResponse('4','4.0000000000000000000');assert.equal(waiting.unavailable,true);assert.equal(waiting.beyondBounds,undefined);
  const s=makeSession({...mock,questions:[{...q,answer:'4.0000000000000000000'}]},0);s.answers.n1='4';assert.equal(finishSession(s,1).results[0].status,'checker_unavailable');}
 // Malformed and undefined literals are still wrong, and numbers within the bounds are still marked.
 for(const value of ['4/0','4/-0','0/0','abc','1e3']){const check=checkNumericResponse(value,'4');assert.equal(check.ok,false,value);assert.notEqual(check.unavailable,true,value);}
 assert.equal(checkNumericResponse('8/2','4').equivalent,true);
 assert.equal(checkNumericResponse('9223372036854775807','4').equivalent,false);
});
