import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateBackup} from '../dist/lib/backup.js';
import {makeSession,finishSession} from '../dist/lib/session.js';
import {generateMock,questionBank} from '../dist/lib/questions.js';
import {finalizeReview} from '../dist/lib/grader.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const active=()=>makeSession(generateMock({count:6,seed:42}),1000000);
const backup=()=>({schema:'noether-backup-v1',history:[],reviews:[],session:null,proofDraft:'',proofId:null});

test('full backup round-trips sessions, per-question drafts, review linkage and custom proofs',()=>{
 const b=backup(),s=active(),q=questionBank.find(q=>q.type==='proof');s.answers[s.questions[0].id]='My saved argument';
 b.history=[finishSession(s,1100000)];b.session=active();b.proofDraft='Keep this draft';b.proofDrafts={[q.id]:'Stored argument'};b.reviewQuestion=q;b.proofId=q.id;b.proofAttemptId=s.attemptId;
 const r=finalizeReview({question:q,criterionScores:Object.fromEntries(q.rubric.map(c=>[c.id,c.points])),reviewer:'Self assessment',rationale:'Every step checked',answer:'My proof',reviewedAt:'2026-11-03T12:00:00.000Z'});
 b.reviews=[{...r,questionTitle:q.title,attemptId:s.attemptId}];
 const v=validateBackup(JSON.stringify(b));
 assert.equal(v.mode,'full');assert.equal(v.session.deadline,b.session.deadline);assert.equal(v.proofDraft,'Keep this draft');assert.deepEqual(v.proofDrafts,b.proofDrafts);assert.equal(v.reviewQuestion.id,q.id);assert.equal(v.reviews[0].attemptId,s.attemptId);assert.equal(v.proofAttemptId,s.attemptId);assert.equal(v.reviews[0].reviewerIdentityVerified,false);
 assert.equal(v.reviewAttemptId,s.attemptId);assert.equal(validateBackup({...b,proofAttemptId:null,reviewAttemptId:s.attemptId}).reviewAttemptId,s.attemptId);assert.equal(validateBackup({...b,reviewQuestion:null}).reviewAttemptId,null);
});
test('raw active exports restore the original deadline and do not contain arbitrary fields',()=>{
 const s=active();s.untrusted='<script>alert(1)</script>';const v=validateBackup(s);
 assert.equal(v.mode,'active');assert.equal(v.session.deadline,s.deadline);assert.equal(v.session.startedAt,s.startedAt);assert.equal(v.session.untrusted,undefined);
});
test('imported result scores are discarded and recomputed from answers',()=>{
 const s=active(),n=s.questions.find(q=>q.type==='numeric');s.answers[n.id]=String(n.answer);const a=finishSession(s,1100000);for(const r of a.results)r.score=99999;const b=backup();b.history=[a];
 const v=validateBackup(b);assert.equal(v.history[0].results.find(r=>r.id===n.id).score,n.maxMarks);assert.ok(v.history[0].results.filter(r=>r.type==='proof').every(r=>r.score===null));
});
test('rejects injected score fields, duplicate ids, nonfinite marks and malformed rubrics',()=>{
 const edits=[s=>s.questions[0].maxMarks='<img src=x onerror=alert(1)>',s=>s.questions[0].rubric[0].points='<svg onload=alert(1)>',s=>s.questions[0].rubric[0].points=Infinity,s=>s.questions[0].rubric[0].points=-1,s=>s.questions[1].id=s.questions[0].id,s=>s.questions[0].id='__proto__',s=>s.questions[0].rubric=[],s=>s.questions[0].solution=null];
 for(const edit of edits){const s=active();edit(s);assert.throws(()=>validateBackup(s));}
});
test('rejects bad timing, unknown answers and oversize submitted text',()=>{
 const edits=[s=>delete s.durationMinutes,s=>s.durationMinutes=NaN,s=>s.durationMinutes=0,s=>s.deadline+=60000,s=>s.startedAt=-1,s=>s.current=999,s=>s.answers.unknown='answer',s=>s.answers[s.questions[0].id]=3,s=>s.answers[s.questions[0].id]='x'.repeat(50001),s=>s.flags[s.questions[0].id]='false'];
 for(const edit of edits){const s=active();edit(s);assert.throws(()=>validateBackup(s));}
});
test('review scores must agree with validated criteria and are marked unverified',()=>{
 const q=questionBank.find(q=>q.type==='proof'),r={...finalizeReview({question:q,criterionScores:Object.fromEntries(q.rubric.map(c=>[c.id,0])),reviewer:'Reviewer',rationale:'Missing argument'}),questionTitle:q.title};
 const b=backup();b.reviews=[r];assert.equal(validateBackup(b).reviews[0].score,0);
 for(const key of ['score','maxMarks']){const bad=clone(b);bad.reviews[0][key]='<svg onload=alert(1)>';assert.throws(()=>validateBackup(bad));}
 const wrong=clone(b);wrong.reviews[0].score=1;assert.throws(()=>validateBackup(wrong));
});
test('real official archive reference sets round-trip including RMO combined solutions',async()=>{
 const archive=JSON.parse(await readFile(new URL('../dist/archive.json',import.meta.url),'utf8'));
 for(const p of archive.papers){const qs=[{id:p.id+'-slot-1',title:'Response slot 1',statement:'Read the linked official paper.',topic:'reference',type:'reference',maxMarks:null,source:{kind:p.kind,label:p.label,url:p.url}}];
 const s=makeSession({id:p.id,title:p.title,durationMinutes:p.durationMinutes||180,questions:qs,maxMarks:p.maxMarks,reference:true},1000000);
 assert.equal(validateBackup(s).session.questions[0].source.url,p.url);
 }
 const p=archive.papers[0],s=makeSession({id:'reference-test',title:'References',durationMinutes:180,reference:true,maxMarks:null,questions:[{id:'r1',title:'Question',statement:'Question',topic:'geometry',type:'reference',maxMarks:null,source:{kind:p.kind,label:p.label,url:p.url}}]},1000000);
 for(const malicious of ['javascript:alert(1)','https://www.cmi.ac.in.evil.example/x','https://www.cmi.ac.in@evil.example/x','https://evil.example/x','https://user:pass@www.cmi.ac.in/x','http://www.cmi.ac.in/x']){const bad=clone(s);bad.questions[0].source.url=malicious;assert.throws(()=>validateBackup(bad));}
});
test('every chapter reference set from the official archive round-trips, including question ranges',async()=>{
 const archive=JSON.parse(await readFile(new URL('../dist/archive.json',import.meta.url),'utf8'));
 // The same question shape as referenceQuestion in app.js. Range ids such as cmi-2024-a2–a3 use an en dash.
 const questions=archive.questionReferences.map(r=>({id:r.id,title:r.title,statement:`Open ${r.exam} ${r.year}, question ${r.questionNumber}, in the official PDF below.`,topic:r.topic,type:'reference',maxMarks:r.maxMarks??null,source:{kind:r.sourceKind,label:r.sourceLabel,url:r.url}}));
 assert.ok(questions.some(q=>q.id.includes('–')));
 for(let i=0;i<questions.length;i+=6){
  const s=makeSession({id:'chapter-1000000',title:'Official references',reference:true,durationMinutes:120,questions:questions.slice(i,i+6),maxMarks:null},1000000);
  for(const q of s.questions)s.answers[q.id]='Working for '+q.id;
  const ids=s.questions.map(q=>q.id);
  assert.deepEqual(validateBackup(clone(s)).session.questions.map(q=>q.id),ids);
  const b=backup();b.history=[finishSession(s,1100000)];
  const restored=validateBackup(clone(b)).history[0];
  assert.deepEqual(restored.questions.map(q=>q.id),ids);
  assert.deepEqual(restored.answers,s.answers);
 }
 const s=active();s.questions[0].id='a2–a3 ';assert.throws(()=>validateBackup(s));
});
test('rejects unsafe draft maps and strips nested unknown metadata',()=>{
 const b=backup();b.proofDrafts=JSON.parse('{"__proto__":"bad"}');assert.throws(()=>validateBackup(b));
 const s=active();s.questions[0].unsafe={script:'evil'};const v=validateBackup(s);assert.equal(v.session.questions[0].unsafe,undefined);
});

test('rejects inherited object-property identifiers in imported questions',()=>{
 for(const key of Object.getOwnPropertyNames(Object.prototype)){const s=active();s.questions[0].id=key;assert.throws(()=>validateBackup(s),key);}
});


test('a submitted attempt remains frozen after backup restore', () => {
  const original = active();
  original.submittedAt = original.startedAt + 10000;
  original.answers[original.questions[0].id] = 'A preserved submitted answer';
  const restored = validateBackup(clone(original)).session;
  assert.equal(restored.submittedAt, original.submittedAt);
  assert.deepEqual(restored.answers, original.answers);
  assert.equal(restored.deadline, original.deadline);
  for (const submittedAt of ['1000000', -1, original.startedAt - 1]) {
    assert.throws(() => validateBackup({...original, submittedAt}));
  }
});
