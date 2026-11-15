import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateBackup} from '../dist/lib/backup.js';
import {makeSession,finishSession,submissionTime,orderTimes,retryTitle} from '../dist/lib/session.js';
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
  for (const submittedAt of ['1000000', -1]) {
    assert.throws(() => validateBackup({...original, submittedAt}));
  }
  // A submission stamped just before the start, after the clock stepped back, restores at the start.
  assert.equal(validateBackup({...original, submittedAt: original.startedAt - 1}).session.submittedAt, original.startedAt);
});

test('work stamped after the clock stepped back is saved in a form its own restore accepts', () => {
  const s = active(), back = s.startedAt - 300000;
  s.answers[s.questions[0].id] = 'Submitted after the clock correction';
  assert.equal(validateBackup(clone({...s, submittedAt: submissionTime(s, back)})).session.submittedAt, s.startedAt);
  const b = backup();
  b.history = [orderTimes(finishSession(s, back))];
  b.session = orderTimes({...active(), submittedAt: back});
  const restored = validateBackup(clone(b));
  assert.equal(restored.history[0].finishedAt, s.startedAt);
  assert.equal(restored.session.submittedAt, b.session.startedAt);
});

test('a backup the previous release exported after the clock stepped back restores with its times in order', () => {
  // The previous release stamped the wall clock: a 15-minute step back, 5 minutes in, put both times before the start.
  const s = active(), back = s.startedAt - 600000, n = s.questions.find(q => q.type === 'numeric');
  for (const q of s.questions) s.answers[q.id] = q.type === 'numeric' ? String(q.answer) : 'Written before the clock moved.';
  const b = backup();
  b.history = [finishSession(s, back)];
  b.session = {...clone(s), submittedAt: back};
  assert.ok(b.history[0].finishedAt < s.startedAt && b.session.submittedAt < s.startedAt);
  const restored = validateBackup(JSON.stringify(b));
  assert.equal(restored.history[0].finishedAt, s.startedAt);
  assert.equal(restored.history[0].results.find(r => r.id === n.id).score, n.maxMarks);
  assert.equal(restored.session.submittedAt, s.startedAt);
  assert.deepEqual(restored.session.answers, s.answers);
  // Its exported active draft too.
  const draft = validateBackup(JSON.stringify(b.session));
  assert.equal(draft.mode, 'active');
  assert.equal(draft.session.submittedAt, s.startedAt);
  // A value that is not a time at all is still refused.
  for (const bad of ['1000000', -1, 1.5, 8640000000000001]) {
    assert.throws(() => validateBackup({...b.session, submittedAt: bad}), String(bad));
    assert.throws(() => validateBackup({...backup(), history: [{...b.history[0], finishedAt: bad}]}), String(bad));
  }
});

test('a backup holding one attempt id twice, as the previous release could save it, restores both attempts', () => {
  const s = active(), n = s.questions.find(q => q.type === 'numeric');
  const original = finishSession({...s, answers: {[n.id]: String(n.answer)}}, s.startedAt + 1000);
  // A draft exported before finishing, restored and finished again: same attempt id, newest first.
  const again = finishSession({...s, answers: {[n.id]: '12345'}}, s.startedAt + 5000);
  const b = backup();
  b.history = [again, original];
  const restored = validateBackup(clone(b));
  assert.equal(restored.history.length, 2);
  assert.equal(new Set(restored.history.map(a => a.attemptId)).size, 2);
  assert.equal(restored.history[1].attemptId, s.attemptId, 'the attempt finished first keeps its id');
  assert.equal(restored.history[0].answers[n.id], '12345');
  assert.equal(restored.history[1].results.find(r => r.id === n.id).score, n.maxMarks);
});

test('a proof draft the symbol buttons pushed past the 50,000-character editor limit still restores', () => {
  const q = questionBank.find(q => q.type === 'proof'), long = 'Proof step. '.repeat(4167);
  assert.ok(long.length > 50000);
  const b = {...backup(), proofDraft: long, proofId: q.id, proofDrafts: {[q.id]: long}};
  const restored = validateBackup(clone(b));
  assert.equal(restored.proofDraft, long);
  assert.equal(restored.proofDrafts[q.id], long);
  // Submitted answers keep their limit: the answer field never accepted more.
  const s = active();
  s.answers[s.questions[0].id] = long;
  assert.throws(() => validateBackup(s));
});

test('every official reference set round-trips, including question ranges named with an en dash', async () => {
  const archive = JSON.parse(await readFile(new URL('../dist/archive.json', import.meta.url), 'utf8'));
  // The question shape referenceQuestion builds in app.js. Range ids such as cmi-2024-a2–a3 use an en dash.
  const questions = archive.questionReferences.map(r => ({id: r.id, title: r.title,
    statement: `Open ${r.exam} ${r.year}, question ${r.questionNumber}, in the official PDF below.`,
    topic: r.topic, type: 'reference', maxMarks: r.maxMarks ?? null,
    source: {kind: r.sourceKind, label: r.sourceLabel, url: r.url}}));
  assert.ok(questions.some(q => q.id.includes('–')));
  for (let i = 0; i < questions.length; i += 6) {
    const s = makeSession({id: 'chapter-1000000', title: 'Probability · official references', reference: true,
      durationMinutes: 120, questions: questions.slice(i, i + 6), maxMarks: null}, 1000000);
    for (const q of s.questions) s.answers[q.id] = 'Working for ' + q.id;
    const ids = s.questions.map(q => q.id);
    // An exported active draft, and a full backup holding the set as history and as the active test.
    assert.deepEqual(validateBackup(clone(s)).session.questions.map(q => q.id), ids);
    const b = backup();
    b.history = [finishSession(s, 1100000)];
    b.session = clone(s);
    const restored = validateBackup(clone(b));
    assert.deepEqual(restored.history[0].questions.map(q => q.id), ids);
    assert.deepEqual(restored.history[0].answers, s.answers);
    assert.deepEqual(restored.session.answers, s.answers);
  }
  // Only question ids take the en dash; the rest of the identifier rules are unchanged.
  for (const bad of ['a2–a3 ', '–a2', 'a2—a3']) {
    const s = active();
    s.questions[0].id = bad;
    assert.throws(() => validateBackup(s), bad);
  }
  const b = backup();
  b.bookmarks = ['cmi-2024-a2–a3'];
  assert.throws(() => validateBackup(b));
});

test('a long assessment reason or a retried test title the previous release saved still restores', () => {
  const q = questionBank.find(q => q.type === 'proof'), reason = 'Each step is justified. '.repeat(2400);
  assert.ok(reason.length > 50000);
  // The reason field had no length limit, and finalizeReview accepts any non-empty reason.
  const r = finalizeReview({question: q, criterionScores: Object.fromEntries(q.rubric.map(c => [c.id, 0])),
    reviewer: 'Self assessment', rationale: reason});
  const b = backup();
  b.reviews = [{...r, questionTitle: q.title}];
  assert.equal(validateBackup(clone(b)).reviews[0].rationale, reason.trim());
  // Each "Retry this set" added " · retry": 61 retries of "CMI Mixed Practice" made a 506-character title.
  const s = active(), chained = s.title + ' · retry'.repeat(61);
  assert.ok(chained.length > 500);
  const retried = {...s, title: chained};
  assert.equal(validateBackup(clone(retried)).session.title, chained);
  b.history = [finishSession(retried, s.startedAt + 1000)];
  assert.equal(validateBackup(clone(b)).history[0].title, chained);
  // Retrying now stops lengthening the title within the 500 characters earlier releases restore.
  let title = s.title;
  for (let i = 0; i < 100; i++) {
    const next = retryTitle(title);
    assert.ok(next.length <= 500 && (next === title || next === title + ' · retry'));
    title = next;
  }
  assert.ok(title.length > 490 && title.startsWith(s.title + ' · retry'));
  assert.equal(retryTitle(chained), chained);
});
