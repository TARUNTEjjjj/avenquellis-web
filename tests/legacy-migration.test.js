import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {migrationDestination,readMigration} from '../legacy-domain/workspace.js';
import {validateBackup} from '../dist/lib/backup.js';
import {questionBank} from '../dist/lib/questions.js';
import {makeSession,remainingSeconds,finishSession} from '../dist/lib/session.js';
const proof=questionBank.find(q=>q.templateId==='number-gcd');
const num=questionBank.find(q=>q.type==='numeric');
const session=makeSession({id:'migration-timed',title:'Migration timed test',questions:[proof,num],durationMinutes:20},1_000_000);
session.answers[proof.id]='A saved proof with two divisor inclusions.';session.flags[proof.id]=true;session.current=1;
const history=finishSession({...session,attemptId:'older-complete'},session.startedAt+50000);
const review={model:'research-model',provider:'workers-ai',promptVersion:'known-v1',date:new Date(0).toISOString(),max:proof.maxMarks,suggested:proof.maxMarks,
 criteria:proof.rubric.map(c=>({id:c.id,description:c.description,maxPoints:c.points,reviewers:[1,2].map(reviewer=>({reviewer,points:c.points,quotes:[session.answers[proof.id]]}))})),
 reviews:[1,2].map(number=>({number,status:'proposal',score:proof.maxMarks,rationale:'Practice fixture.',gaps:[]}))};
const reviewKey=createHash('sha256').update(JSON.stringify([proof.id,proof.statement,proof.rubric,session.answers[proof.id]])).digest('hex');
const modelRecords=[{key:reviewKey,review}];
function storage(records) {
 const values=new Map(Object.entries(records).map(([k,v])=>[k,typeof v==='string'?v:JSON.stringify(v)]));
 return {getItem:key=>values.get(key)??null,setItem(){assert.fail('Migration must never modify storage')},removeItem(){assert.fail('Migration must never erase storage')}};
}

test('timed test, existing answers, flags, drafts, history and model marks survive real backup validation',()=>{
 const snapshot={history:[history],reviews:[],session,proofDraft:session.answers[proof.id],proofId:proof.id,proofDrafts:{[proof.id]:session.answers[proof.id]},reviewQuestion:proof,proofAttemptId:session.attemptId,bookmarks:[proof.id]};
 const found=readMigration(storage({'noether.v1':snapshot,'noether.prose-reviews.v1':modelRecords}));assert.equal(found.snapshots.length,1);
 const restored=validateBackup(JSON.stringify(found.snapshots[0].backup));assert.equal(restored.session.deadline,session.deadline);assert.equal(restored.session.startedAt,session.startedAt);assert.equal(restored.session.current,1);assert.deepEqual(restored.session.answers,session.answers);assert.equal(restored.session.flags[proof.id],true);
 assert.equal(restored.history.length,1);assert.equal(restored.proofDrafts[proof.id],session.answers[proof.id]);assert.deepEqual(restored.bookmarks,[proof.id]);
 assert.equal(restored.modelReviews[0].key,reviewKey);assert.ok(restored.modelReviews[0].review.imported);assert.equal(remainingSeconds(restored.session,session.deadline+5),0);
});
test('model-only saved data yields an importable full backup with explicit empty required arrays',()=>{
 const {snapshots}=readMigration(storage({'noether.prose-reviews.v1':modelRecords}));assert.equal(snapshots.length,1);
 const restored=validateBackup(JSON.stringify(snapshots[0].backup));assert.deepEqual(restored.history,[]);assert.deepEqual(restored.reviews,[]);assert.equal(restored.modelReviews.length,1);
});
test('corrupt side record can be exported for recovery without losing an intact active test',()=>{
 const found=readMigration(storage({'noether.v1':{session},'noether.prose-reviews.v1':'{broken'}));assert.ok(found.issues.length);assert.equal(found.originals['noether.prose-reviews.v1'],'{broken');
 const restored=validateBackup(found.snapshots[0].backup);assert.equal(restored.session.deadline,session.deadline);assert.equal(restored.modelReviews,null);
});
test('distinguishes multiple snapshots, handles inaccessible storage, and ignores a fresh visit',()=>{
 const found=readMigration(storage({'noether.v1':{proofDraft:'old'},'veyra.workspace.v1':{proofDraft:'later'},'avenquellis.workspace.v1':{proofDraft:'latest'}}));assert.deepEqual(found.snapshots.map(s=>s.name),['Avenquellis','Veyra','Noether']);
 const identical=readMigration(storage({'noether.v1':{proofDraft:'same'},'veyra.workspace.v1':{proofDraft:'same'}}));assert.equal(identical.snapshots.length,1);
 assert.equal(readMigration(storage({'noether.v1':{history:[],reviews:[],proofDrafts:{},proofId:proof.id,paused:true}})).snapshots.length,0);
 assert.equal(readMigration({getItem(){throw new Error('blocked')}}).accessible,false);
});
test('redirects use the fixed production origin, preserve ordinary deep links and strip credential parameters',()=>{
 assert.equal(migrationDestination('https://noether-math-lab.pages.dev/?year=2025&token=unsafe#proof'),'https://avenquellis.pages.dev/?year=2025#proof');
 assert.equal(migrationDestination('https://old.example/%2f%2fevil.example/page?q=2#session'),'https://avenquellis.pages.dev/evil.example/page?q=2#session');
 assert.equal(migrationDestination('https://old.example/past/paper#access_token=unsafe'),'https://avenquellis.pages.dev/past/paper');
});
